import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';

const logger = createLogger('members');

type MemberRow = {
  id: string;
  full_name: string;
  age: number | null;
  gender: string | null;
};

export async function GET(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    const searchParams = new URL(request.url).searchParams;
    const q = searchParams.get('q')?.trim() ?? '';
    const limitRaw = Number(searchParams.get('limit') ?? '50');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const minAgeRaw = searchParams.get('minAge');
    const parsedMinAge = minAgeRaw === null ? null : Number(minAgeRaw);
    const minAge = parsedMinAge !== null && Number.isFinite(parsedMinAge) ? Math.max(parsedMinAge, 0) : null;
    const leadershipOnly = searchParams.get('leadershipOnly') === 'true';

    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const tokens = q
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    let result;
    if (tokens.length > 0) {
      // Build conditions so each search token must match full_name (matches "First Last" against "Last, First")
      const conditions = tokens.map((_, i) => `full_name ILIKE $${i + 2}`).join(' AND ');
      const params: Array<string | number> = [wardId, ...tokens.map((t) => `%${t}%`)];
      const ageParamIndex = tokens.length + 2;
      const limitParamIndex = minAge === null ? tokens.length + 2 : tokens.length + 3;
      const ageClause = minAge === null ? '' : `AND age >= $${ageParamIndex}::int`;
      if (minAge !== null) params.push(minAge);
      params.push(limit);

      result = await client.query(
        `SELECT m.id, m.full_name, m.age, m.gender
           FROM member m
          WHERE m.ward_id = $1::uuid
            AND m.archived_at IS NULL
            ${ageClause}
            ${leadershipOnly ? `AND EXISTS (
              SELECT 1 FROM calling_assignment ca
               WHERE ca.member_id = m.id
                 AND ca.ward_id = m.ward_id
                 AND ca.is_active = TRUE
                 AND lower(ca.organization) IN ('stake presidency', 'bishopric', 'district presidency', 'branch presidency')
            )` : ''}
            AND ${conditions}
          ORDER BY full_name ASC
          LIMIT $${limitParamIndex}::int`,
        params
      );
    } else {
      const ageClause = minAge === null ? '' : 'AND age >= $2::int';
      const limitParamIndex = minAge === null ? 2 : 3;
      result = await client.query(
        `SELECT m.id, m.full_name, m.age, m.gender
           FROM member m
          WHERE m.ward_id = $1::uuid
            AND m.archived_at IS NULL
            ${ageClause}
            ${leadershipOnly ? `AND EXISTS (
              SELECT 1 FROM calling_assignment ca
               WHERE ca.member_id = m.id
                 AND ca.ward_id = m.ward_id
                 AND ca.is_active = TRUE
                 AND lower(ca.organization) IN ('stake presidency', 'bishopric', 'district presidency', 'branch presidency')
            )` : ''}
          ORDER BY full_name ASC
          LIMIT $${limitParamIndex}::int`,
        minAge === null ? [wardId, limit] : [wardId, minAge, limit]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      members: (result.rows as MemberRow[]).map((row) => ({
        id: row.id,
        fullName: row.full_name,
        age: row.age,
        gender: row.gender
      }))
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Failed to get members', { wardId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to load members', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
