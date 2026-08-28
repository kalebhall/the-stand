import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { CALLING_STATUS } from '@/src/callings/lifecycle';
import { queueCallingBusinessLine } from '@/src/callings/meeting-business';
import { appendCallingStatus, fetchCurrentCallingStatus } from '@/src/callings/transition';
import { canManageCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';

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
      toStatus: CALLING_STATUS.TO_BE_RELEASED
    });

    if (!transition.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid transition', code: transition.reason }, { status: 409 });
    }

    // Queue a RELEASE ward business line on the next upcoming sacrament meeting.
    // If no future meeting exists, a DRAFT SACRAMENT meeting is auto-created for the next Sunday.
    const meetingId = await queueCallingBusinessLine(client, { wardId, callingId, actionType: 'RELEASE' });

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'CALLING_TO_BE_RELEASED', jsonb_build_object('callingAssignmentId', $3::text, 'meetingId', $4::text))`,
      [wardId, session.user.id, callingId, meetingId]
    );

    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId,
      aggregateType: 'calling_assignment',
      aggregateId: callingId,
      eventType: 'CALLING_RELEASED',
      payload: { callingAssignmentId: callingId, status: CALLING_STATUS.TO_BE_RELEASED, meetingId }
    });

    await client.query('COMMIT');
    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);

    return NextResponse.json({ id: callingId, status: CALLING_STATUS.TO_BE_RELEASED, meetingId });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to mark calling for release', { wardId, callingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to mark calling for release', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
