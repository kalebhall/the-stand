import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type MemberRow = {
  id: string;
  full_name: string;
};

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
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
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const result = await client.query(`SELECT id, full_name FROM member WHERE ward_id = $1 ORDER BY full_name ASC`, [wardId]);

    await client.query('COMMIT');

    return NextResponse.json({
      members: (result.rows as MemberRow[]).map((row) => ({
        id: row.id,
        fullName: row.full_name
      }))
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load members', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
