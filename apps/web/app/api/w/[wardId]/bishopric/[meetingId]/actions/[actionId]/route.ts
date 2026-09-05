import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { BISHOPRIC_ACTION_STATUSES, validateBishopricActionTransition, type BishopricActionStatus } from '@/src/leadership/bishopric';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

async function getAccess(wardId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }) };
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return { response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
  return { session };
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const { wardId, meetingId } = await context.params;
  const access = await getAccess(wardId);
  if (access.response) return access.response;
  const body = await request.json().catch(() => null) as { title?: string; details?: string; decision?: string; ownerName?: string; dueDate?: string; carryForward?: boolean } | null;
  const title = text(body?.title);
  const dueDate = text(body?.dueDate);
  if (!title || title.length > 200 || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) return NextResponse.json({ error: 'Invalid bishopric action payload', code: 'BAD_REQUEST' }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: access.session.user.id, wardId });
    const meeting = await client.query('SELECT id FROM bishopric_meeting WHERE id = $1::uuid AND ward_id = $2::uuid FOR SHARE', [meetingId, wardId]);
    if (!meeting.rowCount) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Bishopric meeting not found', code: 'NOT_FOUND' }, { status: 404 }); }
    const result = await client.query(
      `INSERT INTO bishopric_action (ward_id, bishopric_meeting_id, title, details, decision, owner_name, due_date, carry_forward)
       VALUES ($1::uuid, $2::uuid, $3::text, NULLIF($4::text, ''), NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, '')::date, $8::boolean)
       RETURNING *`, [wardId, meetingId, title, text(body?.details), text(body?.decision), text(body?.ownerName), dueDate, Boolean(body?.carryForward)]
    );
    await recordAuditEvent(client, { wardId, userId: access.session.user.id, actorName: access.session.user.name || access.session.user.email || null, action: 'BISHOPRIC_ACTION_CREATED', entityType: 'bishopric_action', entityId: result.rows[0].id, changes: { title: { old: null, new: title }, status: { old: null, new: 'PENDING' } }, details: { private: true, bishopricMeetingId: meetingId }, source: 'manual_ui', severity: 'info' });
    await client.query('COMMIT');
    return NextResponse.json({ action: result.rows[0] }, { status: 201 });
  } catch (error) { await client.query('ROLLBACK'); console.error('bishopric_action_create_failed', { wardId, userId: access.session.user.id, error }); return NextResponse.json({ error: 'Failed to create bishopric action', code: 'INTERNAL_ERROR' }, { status: 500 }); } finally { client.release(); }
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; meetingId: string; actionId: string }> }) {
  const { wardId, meetingId, actionId } = await context.params;
  const access = await getAccess(wardId);
  if (access.response) return access.response;
  const body = await request.json().catch(() => null) as { status?: string } | null;
  const nextStatus = text(body?.status) as BishopricActionStatus;
  if (!BISHOPRIC_ACTION_STATUSES.includes(nextStatus)) return NextResponse.json({ error: 'Invalid action status', code: 'BAD_REQUEST' }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await setDbContext(client, { userId: access.session.user.id, wardId });
    const current = await client.query('SELECT id, status FROM bishopric_action WHERE id = $1::uuid AND bishopric_meeting_id = $2::uuid AND ward_id = $3::uuid FOR UPDATE', [actionId, meetingId, wardId]);
    if (!current.rowCount) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Bishopric action not found', code: 'NOT_FOUND' }, { status: 404 }); }
    const error = validateBishopricActionTransition(current.rows[0].status, nextStatus);
    if (error) { await client.query('ROLLBACK'); return NextResponse.json({ error, code: 'INVALID_TRANSITION' }, { status: 422 }); }
    const result = await client.query(`UPDATE bishopric_action SET status = $1::text, completed_at = CASE WHEN $1::text = 'COMPLETED' THEN now() ELSE NULL END, completed_by_user_id = CASE WHEN $1::text = 'COMPLETED' THEN $2::uuid ELSE NULL END, updated_at = now() WHERE id = $3::uuid AND ward_id = $4::uuid RETURNING *`, [nextStatus, access.session.user.id, actionId, wardId]);
    await recordAuditEvent(client, { wardId, userId: access.session.user.id, actorName: access.session.user.name || access.session.user.email || null, action: 'BISHOPRIC_ACTION_STATUS_UPDATED', entityType: 'bishopric_action', entityId: actionId, changes: { status: { old: current.rows[0].status, new: nextStatus } }, details: { private: true }, source: 'manual_ui', severity: 'info' });
    await client.query('COMMIT'); return NextResponse.json({ action: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); console.error('bishopric_action_update_failed', { wardId, userId: access.session.user.id, error }); return NextResponse.json({ error: 'Failed to update bishopric action', code: 'INTERNAL_ERROR' }, { status: 500 }); } finally { client.release(); }
}
