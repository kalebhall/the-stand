import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; meetingId: string; actionId: string }> }) {
  const session = await auth();
  const { wardId, meetingId, actionId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status;
  if (status !== 'announced' && status !== 'completed' && status !== 'lcr_completed' && status !== 'interview_completed')
    return NextResponse.json({ error: 'Invalid status.', code: 'INVALID_INPUT' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result =
      status === 'announced'
        ? await client.query(
            `UPDATE meeting_membership_ordinance SET status = 'action_needed', announced_at = COALESCE(announced_at, now()), updated_at = now()
           WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid AND status = 'pending'
           RETURNING id, status`,
            [actionId, meetingId, wardId]
          )
        : status === 'completed'
          ? await client.query(
              `UPDATE meeting_membership_ordinance SET status = 'completed', completed_at = now(), completed_by_user_id = $1::uuid, updated_at = now()
             WHERE id = $2::uuid AND meeting_id = $3::uuid AND ward_id = $4::uuid AND status = 'action_needed'
             RETURNING id, status, member_name, action_type, lcr_follow_up_status`,
              [session.user.id, actionId, meetingId, wardId]
            )
          : status === 'lcr_completed'
            ? await client.query(
                `UPDATE meeting_membership_ordinance SET lcr_follow_up_status = 'completed', lcr_updated_at = now(), updated_at = now()
               WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid AND status = 'completed' AND lcr_follow_up_status = 'needed'
               RETURNING id, status, member_name, action_type, lcr_follow_up_status`,
                [actionId, meetingId, wardId]
              )
            : await client.query(
                `UPDATE meeting_membership_ordinance SET interview_status = 'completed', updated_at = now()
               WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid AND interview_status IN ('needed', 'scheduled')
               RETURNING id, status, member_name, action_type, lcr_follow_up_status`,
                [actionId, meetingId, wardId]
              );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Action not found or not in the expected state.', code: 'CONFLICT' }, { status: 409 });
    }
    let notificationEventOutboxId: string | null = null;
    const updatedAction = result.rows[0] as {
      id: string;
      member_name: string;
      action_type: string;
      lcr_follow_up_status: string;
    };
    if (status === 'announced' || (status === 'completed' && updatedAction.lcr_follow_up_status === 'needed')) {
      notificationEventOutboxId = await insertNotificationOutboxEvent(client, {
        wardId,
        aggregateType: 'membership_ordinance',
        aggregateId: actionId,
        eventType: status === 'announced' ? 'MEMBERSHIP_ORDINANCE_ACTION_NEEDED_REMINDER' : 'MEMBERSHIP_ORDINANCE_LCR_NEEDED_REMINDER',
        payload: {
          meetingId,
          memberName: updatedAction.member_name,
          action: updatedAction.action_type,
          subject: updatedAction.member_name
        }
      });
    }
    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, $3::text, jsonb_build_object('meetingId', $4::text, 'actionId', $5::text))`,
      [
        wardId,
        session.user.id,
        status === 'announced'
          ? 'MEMBERSHIP_ORDINANCE_ANNOUNCED'
          : status === 'completed'
            ? 'MEMBERSHIP_ORDINANCE_COMPLETED'
            : status === 'lcr_completed'
              ? 'MEMBERSHIP_ORDINANCE_LCR_UPDATED'
              : 'MEMBERSHIP_ORDINANCE_INTERVIEW_COMPLETED',
        meetingId,
        actionId
      ]
    );
    await client.query('COMMIT');
    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, notificationEventOutboxId);
    return NextResponse.json({ action: result.rows[0] });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to update membership or ordinance action.', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ wardId: string; meetingId: string; actionId: string }> }) {
  const session = await auth();
  const { wardId, meetingId, actionId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId))
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result = await client.query(
      'DELETE FROM meeting_membership_ordinance WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid RETURNING id',
      [actionId, meetingId, wardId]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Action not found.', code: 'NOT_FOUND' }, { status: 404 });
    }
    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to remove action.', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
