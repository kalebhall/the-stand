import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';

import { setDbContext } from '@/src/db/context'

const logger = createLogger('callings');

export async function DELETE(_request: Request, context: { params: Promise<{ wardId: string; callingId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, callingId } = await context.params;

  if (!canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const callingResult = await client.query('SELECT id, member_name, calling_name FROM calling_assignment WHERE id = $1 AND ward_id = $2', [callingId, wardId]);

    if (!callingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Calling not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query('DELETE FROM calling_assignment WHERE id = $1 AND ward_id = $2', [callingId, wardId]);

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'CALLING_DELETED', jsonb_build_object('callingAssignmentId', $3::text, 'memberName', $4::text, 'callingName', $5::text))`,
      [wardId, session.user.id, callingId, callingResult.rows[0].member_name, callingResult.rows[0].calling_name]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to delete calling', { wardId, callingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to delete calling', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
