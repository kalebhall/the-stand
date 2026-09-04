import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const ACTION_TYPES = new Set(['WELCOME_NEW_MEMBER', 'BABY_BLESSING', 'PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT']);
const PRIESTHOOD_ACTION_TYPES = new Set(['PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT']);

function trimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    memberName?: unknown;
    actionType?: unknown;
    reason?: unknown;
    details?: unknown;
    plannedDate?: unknown;
    interviewStatus?: unknown;
    interviewDate?: unknown;
    interviewerName?: unknown;
    responsibleLeader?: unknown;
  } | null;
  const memberName = typeof body?.memberName === 'string' ? body.memberName.trim() : '';
  const actionType = typeof body?.actionType === 'string' ? body.actionType : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null;
  const details = typeof body?.details === 'string' ? body.details.trim() : null;
  const plannedDate = trimmed(body?.plannedDate);
  const interviewStatus = PRIESTHOOD_ACTION_TYPES.has(actionType)
    ? typeof body?.interviewStatus === 'string' && ['needed', 'scheduled', 'completed'].includes(body.interviewStatus)
      ? body.interviewStatus
      : 'needed'
    : 'not_required';
  const interviewDate = trimmed(body?.interviewDate);
  const interviewerName = trimmed(body?.interviewerName);
  const responsibleLeader = trimmed(body?.responsibleLeader);
  const lcrFollowUpStatus = PRIESTHOOD_ACTION_TYPES.has(actionType) ? 'needed' : 'not_applicable';
  if (!memberName || !ACTION_TYPES.has(actionType)) {
    return NextResponse.json({ error: 'Member name and valid action type are required.', code: 'INVALID_INPUT' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meeting = await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [meetingId, wardId]);
    if (!meeting.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found.', code: 'NOT_FOUND' }, { status: 404 });
    }
    const result = await client.query(
      `INSERT INTO meeting_membership_ordinance (ward_id, meeting_id, member_name, action_type, reason, details, planned_date, interview_status, interview_date, interviewer_name, responsible_leader, lcr_follow_up_status)
       VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::date, $8::text, $9::date, $10::text, $11::text, $12::text)
       RETURNING id, member_name, action_type, reason, details, status, planned_date, interview_status, interview_date, interviewer_name, responsible_leader, lcr_follow_up_status, lcr_updated_at, announced_at, completed_at, completed_by_user_id, created_at, updated_at`,
      [
        wardId,
        meetingId,
        memberName,
        actionType,
        reason,
        details,
        plannedDate,
        interviewStatus,
        interviewDate,
        interviewerName,
        responsibleLeader,
        lcrFollowUpStatus
      ]
    );
    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'MEMBERSHIP_ORDINANCE_CREATED', jsonb_build_object('meetingId', $3::text, 'actionId', $4::text, 'actionType', $5::text))`,
      [wardId, session.user.id, meetingId, result.rows[0].id, actionType]
    );
    await client.query('COMMIT');
    return NextResponse.json({ action: result.rows[0] }, { status: 201 });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to create membership or ordinance action.', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
