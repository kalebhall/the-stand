import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const body = await request.json().catch(() => null) as { title?: string; details?: string; decision?: string; ownerName?: string; dueDate?: string; carryForward?: boolean } | null;
  const title = text(body?.title); const dueDate = text(body?.dueDate);
  if (!title || title.length > 200 || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) return NextResponse.json({ error: 'Invalid bishopric action payload', code: 'BAD_REQUEST' }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await setDbContext(client, { userId: session.user.id, wardId });
    const meeting = await client.query('SELECT id FROM bishopric_meeting WHERE id = $1::uuid AND ward_id = $2::uuid FOR SHARE', [meetingId, wardId]);
    if (!meeting.rowCount) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Bishopric meeting not found', code: 'NOT_FOUND' }, { status: 404 }); }
    const result = await client.query(`INSERT INTO bishopric_action (ward_id, bishopric_meeting_id, title, details, decision, owner_name, due_date, carry_forward) VALUES ($1::uuid, $2::uuid, $3::text, NULLIF($4::text, ''), NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, '')::date, $8::boolean) RETURNING *`, [wardId, meetingId, title, text(body?.details), text(body?.decision), text(body?.ownerName), dueDate, Boolean(body?.carryForward)]);
    await client.query('COMMIT'); return NextResponse.json({ action: result.rows[0] }, { status: 201 });
  } catch { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Failed to create bishopric action', code: 'INTERNAL_ERROR' }, { status: 500 }); } finally { client.release(); }
}
