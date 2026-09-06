import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { BISHOPRIC_AGENDA_TEMPLATES, LEADERSHIP_MEETING_TYPES, type LeadershipMeetingType } from '@/src/leadership/bishopric';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

async function authorize(wardId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }) };
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return { response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await authorize(wardId);
  if (access.response) return access.response;
  const requestedType = new URL(request.url).searchParams.get('type');
  if (requestedType && !LEADERSHIP_MEETING_TYPES.includes(requestedType as LeadershipMeetingType)) {
    return NextResponse.json({ error: 'Invalid leadership meeting type', code: 'BAD_REQUEST' }, { status: 400 });
  }
  const meetingType = requestedType ? (requestedType as LeadershipMeetingType) : null;
  const typeClause = meetingType ? ' AND bm.meeting_type = $2::text' : '';
  const params = meetingType ? [wardId, meetingType] : [wardId];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: access.session.user.id, wardId });
    const meetings = await client.query(
      `SELECT bm.id, bm.meeting_date, bm.meeting_type, bm.agenda_template, bm.status,
              COUNT(ba.id)::int AS action_count,
              COUNT(ba.id) FILTER (WHERE ba.status != 'COMPLETED')::int AS open_action_count
         FROM bishopric_meeting bm
         LEFT JOIN bishopric_action ba ON ba.bishopric_meeting_id = bm.id AND ba.ward_id = bm.ward_id
        WHERE bm.ward_id = $1::uuid${typeClause}
        GROUP BY bm.id ORDER BY bm.meeting_date DESC`, params
    );
    const actions = await client.query(
      `SELECT ba.id, ba.bishopric_meeting_id, ba.title, ba.details, ba.decision, ba.owner_name,
              ba.due_date, ba.status, ba.carry_forward, bm.meeting_date,
              ba.member_id, m.full_name AS linked_member_name,
              ba.calling_assignment_id, ca.calling_name AS linked_calling_name,
              ba.linked_membership_action_id
         FROM bishopric_action ba
         JOIN bishopric_meeting bm ON bm.id = ba.bishopric_meeting_id AND bm.ward_id = ba.ward_id
         LEFT JOIN member m ON m.id = ba.member_id AND m.ward_id = ba.ward_id
         LEFT JOIN calling_assignment ca ON ca.id = ba.calling_assignment_id AND ca.ward_id = ba.ward_id
        WHERE ba.ward_id = $1::uuid AND ba.status != 'COMPLETED'${typeClause}
        ORDER BY ba.due_date NULLS LAST, bm.meeting_date DESC, ba.created_at`, params
    );
    await client.query('COMMIT');
    return NextResponse.json({ meetings: meetings.rows, openActions: actions.rows });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load bishopric workspace', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await authorize(wardId);
  if (access.response) return access.response;
  const body = await request.json().catch(() => null) as { meetingDate?: string; agendaTemplate?: string; meetingType?: string } | null;
  const meetingDate = text(body?.meetingDate);
  const meetingType = text(body?.meetingType) || 'BISHOPRIC';
  const agendaTemplate = text(body?.agendaTemplate) || meetingType;
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(meetingDate) || !LEADERSHIP_MEETING_TYPES.includes(meetingType as LeadershipMeetingType) || !BISHOPRIC_AGENDA_TEMPLATES.includes(agendaTemplate as (typeof BISHOPRIC_AGENDA_TEMPLATES)[number])) {
    return NextResponse.json({ error: 'Invalid bishopric meeting payload', code: 'BAD_REQUEST' }, { status: 400 });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: access.session.user.id, wardId });
    const result = await client.query(
      `INSERT INTO bishopric_meeting (ward_id, meeting_date, meeting_type, agenda_template, created_by_user_id)
       VALUES ($1::uuid, $2::date, $3::text, $4::text, $5::uuid) RETURNING id, meeting_date, meeting_type, agenda_template, status`,
      [wardId, meetingDate, meetingType, agendaTemplate, access.session.user.id]
    );
    await recordAuditEvent(client, { wardId, userId: access.session.user.id, actorName: access.session.user.name || access.session.user.email || null, action: 'BISHOPRIC_MEETING_CREATED', entityType: 'bishopric_meeting', entityId: result.rows[0].id, meetingDate, changes: { meetingDate: { old: null, new: meetingDate }, agendaTemplate: { old: null, new: agendaTemplate } }, details: { private: true }, source: 'manual_ui', severity: 'info' });
    await client.query('COMMIT');
    return NextResponse.json({ meeting: result.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('bishopric_meeting_create_failed', { wardId, userId: access.session.user.id, error });
    return NextResponse.json({ error: 'Failed to create bishopric meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}
