import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

export async function DELETE(_request: Request, context: { params: Promise<{ wardId: string; memberId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, memberId } = await context.params;

  if (!canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const memberResult = await client.query('SELECT id, full_name FROM member WHERE id = $1 AND ward_id = $2 LIMIT 1', [memberId, wardId]);

    if (!memberResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Member not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query('DELETE FROM member WHERE id = $1 AND ward_id = $2', [memberId, wardId]);

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEMBER_DELETED', jsonb_build_object('memberId', $3, 'memberName', $4))`,
      [wardId, session.user.id, memberId, memberResult.rows[0].full_name]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to delete member', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
