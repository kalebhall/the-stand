import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { isMeetingStatus, transitionMeetingStatus } from '@/src/conducting/model';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { insertCoreEventOutboxEvent } from '@/src/platform/events/outbox';

const logger = createLogger('meetings');

function isCompletionTransitionError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Cannot complete a ');
}

type AnnouncedBusinessLineRow = {
  id: string;
  member_name: string;
  calling_name: string;
  action_type: string;
};

export async function POST(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const meetingResult = await client.query(
      `SELECT id, status, meeting_date, meeting_type
         FROM meeting
        WHERE id = $1::uuid AND ward_id = $2::uuid
        LIMIT 1
        FOR UPDATE`,
      [meetingId, wardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const currentStatus = String(meetingResult.rows[0].status);
    if (!isMeetingStatus(currentStatus)) throw new Error('Meeting has an invalid status.');
    const nextStatus = transitionMeetingStatus(currentStatus, 'complete');

    const announcedResult = await client.query(
      `SELECT id, member_name, calling_name, action_type
         FROM meeting_business_line
        WHERE ward_id = $1::uuid
          AND meeting_id = $2::uuid
          AND status = 'announced'
        ORDER BY created_at ASC`,
      [wardId, meetingId]
    );

    const announcedBusinessLines = (announcedResult.rows as AnnouncedBusinessLineRow[]).map((row) => ({
      id: row.id,
      memberName: row.member_name,
      callingName: row.calling_name,
      actionType: row.action_type
    }));

    await client.query(
      `UPDATE meeting
          SET status = $3::text,
              updated_at = now()
        WHERE id = $1::uuid AND ward_id = $2::uuid`,
      [meetingId, wardId, nextStatus]
    );

    const outboxResult = await client.query(
      `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1::uuid, 'meeting', $2::uuid, 'MEETING_COMPLETED', $3::jsonb)
       ON CONFLICT (ward_id, event_type, aggregate_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'
       RETURNING id`,
      [wardId, meetingId, JSON.stringify({ meetingId, announcedBusinessLines })]
    );

    const eventOutboxId = outboxResult.rows[0].id as string;
    const notificationEventOutboxIds = [eventOutboxId];

    for (const line of announcedBusinessLines.filter((line) => line.actionType === 'RELEASE')) {
      const releaseOutboxResult = await client.query(
        `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1::uuid, 'meeting_business_line', $2::uuid, 'CALLING_RELEASE_ANNOUNCED', $3::jsonb)
         ON CONFLICT (ward_id, event_type, aggregate_id)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'
         RETURNING id`,
        [
          wardId,
          line.id,
          JSON.stringify({
            meetingId,
            businessLineId: line.id,
            memberName: line.memberName,
            callingName: line.callingName,
            actionType: line.actionType
          })
        ]
      );

      notificationEventOutboxIds.push(releaseOutboxResult.rows[0].id as string);
    }

    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'MEETING_COMPLETED',
      entityType: 'meeting',
      entityId: meetingId,
      changes: {
        status: { old: currentStatus, new: nextStatus },
        announcedBusinessLineCount: { old: 0, new: announcedBusinessLines.length }
      },
      details: {
        meetingId,
        eventOutboxId,
        announcedBusinessLineCount: announcedBusinessLines.length
      },
      source: 'manual_ui',
      severity: 'notice'
    });

    const coreEvent = {
      type: 'MeetingCompleted' as const,
      version: 1 as const,
      wardId,
      actorId: session.user.id,
      meetingId,
      occurredAt: new Date().toISOString()
    };
    const coreEventOutboxId = await insertCoreEventOutboxEvent(client, coreEvent);

    await client.query('COMMIT');

    Promise.resolve(enqueueOutboxNotificationJob({ wardId, eventOutboxId: coreEventOutboxId })).catch((error) => {
      logger.error('meeting_completed_core_event_enqueue_failed', { wardId, meetingId, error });
    });

    for (const queuedEventOutboxId of notificationEventOutboxIds) {
      Promise.resolve(enqueueOutboxNotificationJob({ wardId, eventOutboxId: queuedEventOutboxId })).catch((err) => {
        console.error('[complete] Failed to enqueue notification job', err);
      });
    }

    return NextResponse.json({ success: true, meetingId, eventOutboxId, announcedBusinessLineCount: announcedBusinessLines.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (isCompletionTransitionError(err)) {
      return NextResponse.json({ error: 'Meeting cannot be completed in its current state', code: 'INVALID_TRANSITION' }, { status: 409 });
    }
    logger.error('Failed to complete meeting', { wardId, meetingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to complete meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}