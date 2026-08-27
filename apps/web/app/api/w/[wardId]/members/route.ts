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
      const params = [wardId, ...tokens.map((t) => `%${t}%`), limit];
      const limitParamIndex = tokens.length + 2;

      result = await client.query(
        `SELECT id, full_name, age
           FROM member
          WHERE ward_id = $1
            AND archived_at IS NULL
            AND ${conditions}
          ORDER BY full_name ASC
          LIMIT $${limitParamIndex}`,
        params
      );
    } else {
      result = await client.query(
        `SELECT id, full_name, age
           FROM member
          WHERE ward_id = $1
            AND archived_at IS NULL
          ORDER BY full_name ASC
          LIMIT $2`,
        [wardId, limit]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      members: (result.rows as MemberRow[]).map((row) => ({
        id: row.id,
        fullName: row.full_name,
        age: row.age
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
