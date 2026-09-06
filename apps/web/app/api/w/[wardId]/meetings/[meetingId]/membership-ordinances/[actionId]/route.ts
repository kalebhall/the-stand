import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';
import { validateMembershipOrdinanceTransition, type MembershipOrdinanceTransition } from '@/src/church-actions/membership-ordinance';

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; meetingId: string; actionId: string }> }) {
  const session = await auth();
  const { wardId, meetingId, actionId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { status?: unknown; officialRecordUpdatedBy?: unknown; handoffDate?: unknown; officialSystemReferenceUrl?: unknown } | null;
  const status = body?.status;
  if (status !== 'announced' && status !== 'completed' && status !== 'lcr_completed' && status !== 'interview_completed' && status !== 'official_record_started' && status !== 'official_record_completed' && status !== 'certificate_delivered')
    return NextResponse.json({ error: 'Invalid status.', code: 'INVALID_INPUT' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const current = await client.query(
      `SELECT status, interview_status, lcr_follow_up_status, record_form_needed, official_system_follow_up_status
         FROM meeting_membership_ordinance
        WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid
        FOR UPDATE`,
      [actionId, meetingId, wardId]
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Action not found.', code: 'NOT_FOUND' }, { status: 404 });
    }
    const currentState = current.rows[0] as {
      status: 'pending' | 'action_needed' | 'completed';
      interview_status: 'not_required' | 'needed' | 'scheduled' | 'completed';
      lcr_follow_up_status: 'not_applicable' | 'needed' | 'completed';
      record_form_needed: boolean;
      official_system_follow_up_status: 'not_started' | 'in_progress' | 'completed' | 'not_applicable';
    };
    const transitionError = validateMembershipOrdinanceTransition(
      {
        status: currentState.status,
        interviewStatus: currentState.interview_status,
        lcrFollowUpStatus: currentState.lcr_follow_up_status,
        recordFormNeeded: currentState.record_form_needed,
        officialSystemFollowUpStatus: currentState.official_system_follow_up_status
      },
      status as MembershipOrdinanceTransition
    );
    if (transitionError) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: transitionError, code: 'INVALID_TRANSITION' }, { status: 409 });
    }
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
            : status === 'interview_completed'
              ? await client.query(
              `UPDATE meeting_membership_ordinance SET interview_status = 'completed', updated_at = now()
               WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid AND interview_status IN ('needed', 'scheduled')
               RETURNING id, status, member_name, action_type, lcr_follow_up_status`,
              [actionId, meetingId, wardId]
              )
              : await client.query(
                `UPDATE meeting_membership_ordinance
                    SET official_system_follow_up_status = $1::text,
                        official_record_updated_by = COALESCE($2::text, official_record_updated_by),
                        handoff_date = COALESCE($3::date, handoff_date),
                        official_system_reference_url = COALESCE($4::text, official_system_reference_url),
                        certificate_or_form_delivered = CASE WHEN $5::boolean THEN TRUE ELSE certificate_or_form_delivered END,
                        updated_at = now()
                  WHERE id = $6::uuid AND meeting_id = $7::uuid AND ward_id = $8::uuid
                  RETURNING id, status, member_name, action_type, lcr_follow_up_status`,
                [status === 'official_record_started' ? 'in_progress' : 'completed', body?.officialRecordUpdatedBy ?? null, body?.handoffDate ?? null, body?.officialSystemReferenceUrl ?? null, status === 'certificate_delivered', actionId, meetingId, wardId]
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
    const auditAction = status === 'announced'
      ? 'MEMBERSHIP_ORDINANCE_ANNOUNCED'
      : status === 'completed'
        ? 'MEMBERSHIP_ORDINANCE_COMPLETED'
        : status === 'lcr_completed'
          ? 'MEMBERSHIP_ORDINANCE_LCR_UPDATED'
          : status === 'interview_completed'
            ? 'MEMBERSHIP_ORDINANCE_INTERVIEW_COMPLETED'
            : status === 'official_record_completed'
              ? 'MEMBERSHIP_ORDINANCE_OFFICIAL_RECORD_UPDATED'
              : status === 'certificate_delivered'
                ? 'MEMBERSHIP_ORDINANCE_CERTIFICATE_DELIVERED'
                : 'MEMBERSHIP_ORDINANCE_OFFICIAL_RECORD_HANDOFF_STARTED';
    const field = status === 'announced' || status === 'completed' ? 'status' : status === 'lcr_completed' ? 'lcr_follow_up_status' : status === 'interview_completed' ? 'interview_status' : 'official_system_follow_up_status';
    const newValue = status === 'announced' ? 'action_needed' : status === 'completed' ? 'completed' : status === 'lcr_completed' ? 'completed' : status === 'interview_completed' ? 'completed' : status === 'official_record_started' ? 'in_progress' : 'completed';
    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      actorRole: session.user.roles?.[0] || null,
      action: auditAction,
      entityType: 'membership_ordinance',
      entityId: actionId,
      changes: { [field]: { old: currentState[field as keyof typeof currentState], new: newValue } },
      previousState: currentState,
      details: { meetingId, actionId, memberName: updatedAction.member_name, actionType: updatedAction.action_type },
      source: 'manual_ui',
      severity: 'notice'
    });
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
      'DELETE FROM meeting_membership_ordinance WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid RETURNING id, member_name, action_type, status, interview_status, lcr_follow_up_status, official_system_follow_up_status',
      [actionId, meetingId, wardId]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Action not found.', code: 'NOT_FOUND' }, { status: 404 });
    }
    const deletedAction = result.rows[0] as Record<string, unknown>;
    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      actorRole: session.user.roles?.[0] || null,
      action: 'MEMBERSHIP_ORDINANCE_DELETED',
      entityType: 'membership_ordinance',
      entityId: actionId,
      previousState: deletedAction,
      changes: { deleted: { old: false, new: true } },
      details: { meetingId, actionId, memberName: deletedAction.member_name, actionType: deletedAction.action_type },
      source: 'manual_ui',
      severity: 'notice'
    });
    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to remove action.', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
