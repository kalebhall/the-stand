import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageCallings } from '@/src/auth/roles';
import { CALLING_STATUS } from '@/src/callings/lifecycle';
import { appendCallingStatus, fetchCurrentCallingStatus } from '@/src/callings/transition';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';

const logger = createLogger('callings');

export async function POST(_: Request, context: { params: Promise<{ wardId: string; callingId: string }> }) {
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

    const currentStatus = await fetchCurrentCallingStatus(client, wardId, callingId);
    if (!currentStatus) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Calling not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const transition = await appendCallingStatus(client, {
      wardId,
      callingId,
      fromStatus: currentStatus,
      toStatus: CALLING_STATUS.SET_APART
    });

    if (!transition.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid transition', code: transition.reason }, { status: 409 });
    }

    const callingInfo = await client.query(
      'SELECT ca.calling_name, ca.organization, ca.member_name, ca.member_id FROM calling_assignment ca WHERE ca.id = $1 AND ca.ward_id = $2',
      [callingId, wardId]
    );
    const callingRow = callingInfo?.rows?.[0];

    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'CALLING_SET_APART',
      targetMemberId: callingRow?.member_id || null,
      targetMemberName: callingRow?.member_name || null,
      entityType: 'calling',
      entityId: callingId,
      callingName: callingRow?.calling_name || null,
      organization: callingRow?.organization || null,
      callingStatus: CALLING_STATUS.SET_APART,
      changes: {
        status: { old: currentStatus, new: CALLING_STATUS.SET_APART }
      },
      details: {
        callingAssignmentId: callingId,
        lcrReminder: 'Please record this set apart action in LCR.'
      },
      source: 'manual_ui',
      severity: 'notice'
    });

    const outboxResult = await client.query(
      `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, 'calling_assignment', $2, 'CALLING_SET_APART', $3::jsonb)
       ON CONFLICT (ward_id, event_type, aggregate_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'
       RETURNING id`,
      [
        wardId,
        callingId,
        JSON.stringify({
          callingAssignmentId: callingId,
          instruction: 'Please record this set apart action in LCR.'
        })
      ]
    );

    const eventOutboxId = outboxResult.rows[0].id as string;

    await client.query('COMMIT');

    Promise.resolve(enqueueOutboxNotificationJob({ wardId, eventOutboxId })).catch((err) => {
      console.error('[set-apart] Failed to enqueue notification job', err);
    });

    return NextResponse.json({ id: callingId, status: CALLING_STATUS.SET_APART });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to mark set apart', { wardId, callingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to mark set apart', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
