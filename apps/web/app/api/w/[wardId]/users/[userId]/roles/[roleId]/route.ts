import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canAssignRole, canManageWardUsers } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';

const logger = createLogger('ward-users');

export async function DELETE(_: Request, context: { params: Promise<{ wardId: string; userId: string; roleId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, userId, roleId } = await context.params;
  if (!canManageWardUsers({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const roleResult = await client.query('SELECT name FROM role WHERE id = $1 LIMIT 1', [roleId]);
    if (!roleResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Role not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const roleName = roleResult.rows[0].name as string;
    if (!canAssignRole(session.user.roles, roleName)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden role assignment', code: 'FORBIDDEN' }, { status: 403 });
    }

    const deleteResult = await client.query('DELETE FROM ward_user_role WHERE ward_id = $1 AND user_id = $2 AND role_id = $3', [
      wardId,
      userId,
      roleId
    ]);

    if (!deleteResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Role assignment not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'WARD_ROLE_REVOKED', jsonb_build_object('targetUserId', $3::text, 'roleId', $4::text, 'roleName', $5::text))`,
      [wardId, session.user.id, userId, roleId, roleName]
    );

    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId,
      aggregateType: 'ward_user_role',
      aggregateId: userId,
      eventType: 'WARD_ACCESS_CHANGED',
      payload: { targetUserId: userId, roleId, action: 'removed' }
    });

    await client.query('COMMIT');
    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);
    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to revoke role', { wardId, userId, roleId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to revoke role', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
