import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type MemberRow = {
  id: string;
  full_name: string;
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

    await setDbContext(client, { userId: session.user.id, wardId });

    const result = q
      ? await client.query(
          `SELECT id, full_name
             FROM member
            WHERE ward_id = $1
              AND full_name ILIKE $2
            ORDER BY full_name ASC
            LIMIT $3`,
          [wardId, `%${q}%`, limit]
        )
      : await client.query(
          `SELECT id, full_name
             FROM member
            WHERE ward_id = $1
            ORDER BY full_name ASC
            LIMIT $2`,
          [wardId, limit]
        );

    return NextResponse.json({
      members: (result.rows as MemberRow[]).map((row) => ({
        id: row.id,
        fullName: row.full_name
      }))
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load members', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
