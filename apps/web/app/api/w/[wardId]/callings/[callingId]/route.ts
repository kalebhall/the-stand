import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';

const logger = createLogger('callings');

export async function DELETE(_request: Request, context: { params: Promise<{ wardId: string; callingId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, callingId } = await context.params;

  if (!(await isWardModuleEnabled(wardId, session.user.id, 'callings')) || !canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const callingResult = await client.query(
      `SELECT ca.id, ca.member_name, ca.member_id, ca.calling_name, ca.organization,
              latest.action_status AS status
         FROM calling_assignment ca
         JOIN LATERAL (
           SELECT action_status
             FROM calling_action
            WHERE calling_assignment_id = ca.id
              AND ward_id = ca.ward_id
            ORDER BY created_at DESC
            LIMIT 1
         ) latest ON TRUE
        WHERE ca.id = $1 AND ca.ward_id = $2`,
      [callingId, wardId]
    );

    if (!callingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Calling not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const row = callingResult.rows[0];

    if (row.status !== 'PROPOSED' && row.status !== 'EXTENDED' && row.status !== 'TO_BE_RELEASED') {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Only proposed, extended, or released callings can be deleted', code: 'INVALID_STATUS' },
        { status: 409 }
      );
    }

    await client.query('DELETE FROM calling_assignment WHERE id = $1 AND ward_id = $2', [callingId, wardId]);

    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'CALLING_DELETED',
      targetMemberId: row.member_id || null,
      targetMemberName: row.member_name || null,
      entityType: 'calling',
      entityId: callingId,
      callingName: row.calling_name || null,
      organization: row.organization || null,
      previousState: {
        id: row.id,
        memberName: row.member_name,
        memberId: row.member_id,
        callingName: row.calling_name,
        organization: row.organization
      },
      details: {
        callingAssignmentId: callingId,
        memberName: row.member_name,
        callingName: row.calling_name
      },
      source: 'manual_ui',
      severity: 'notice'
    });

    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId,
      aggregateType: 'calling_assignment',
      aggregateId: callingId,
      eventType: 'CALLING_ASSIGNMENT_CHANGED',
      payload: {
        actorUserId: session.user.id,
        callingAssignmentId: callingId,
        status: 'DELETED',
        memberName: row.member_name,
        callingName: row.calling_name
      }
    });

    await client.query('COMMIT');
    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);

    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to delete calling', { wardId, callingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to delete calling', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
