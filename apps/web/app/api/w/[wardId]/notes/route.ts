import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canUseInternalNotes } from '@/src/auth/roles';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';
import { pool } from '@/src/db/client';
import type { NoteTarget } from '@/src/notes/types';

const targetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MEMBER'), memberId: z.string().uuid() }),
  z.object({ type: z.literal('MEETING'), meetingId: z.string().uuid() }),
  z.object({ type: z.literal('PROGRAM_ITEM'), programItemId: z.string().uuid() }),
  z.object({ type: z.literal('BISHOPRIC_ACTION'), bishopricActionId: z.string().uuid() })
]);

const createNoteSchema = z.object({
  target: targetSchema,
  visibility: z.enum(['PUBLIC', 'LEADERSHIP', 'PRIVATE']),
  noteText: z.string().trim().min(1).max(10000)
});

async function targetExists(client: Awaited<ReturnType<typeof pool.connect>>, wardId: string, target: NoteTarget): Promise<boolean> {
  switch (target.type) {
    case 'MEMBER': {
      const result = await client.query('SELECT id FROM member WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [
        target.memberId,
        wardId
      ]);
      return Boolean(result.rowCount);
    }
    case 'MEETING': {
      const result = await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [
        target.meetingId,
        wardId
      ]);
      return Boolean(result.rowCount);
    }
    case 'PROGRAM_ITEM': {
      const result = await client.query('SELECT id FROM meeting_program_item WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [target.programItemId, wardId]);
      return Boolean(result.rowCount);
    }
    case 'BISHOPRIC_ACTION': {
      const result = await client.query('SELECT id FROM bishopric_action WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [target.bishopricActionId, wardId]);
      return Boolean(result.rowCount);
    }
  }
}

function targetColumns(target: NoteTarget): { memberId: string | null; meetingId: string | null; programItemId: string | null; bishopricActionId: string | null } {
  switch (target.type) {
    case 'MEMBER':
      return { memberId: target.memberId, meetingId: null, programItemId: null, bishopricActionId: null };
    case 'MEETING':
      return { memberId: null, meetingId: target.meetingId, programItemId: null, bishopricActionId: null };
    case 'PROGRAM_ITEM':
      return { memberId: null, meetingId: null, programItemId: target.programItemId, bishopricActionId: null };
    case 'BISHOPRIC_ACTION':
      return { memberId: null, meetingId: null, programItemId: null, bishopricActionId: target.bishopricActionId };
  }
}

export async function GET(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId } = await context.params;
  if (!canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const actionId = new URL(request.url).searchParams.get('bishopricActionId');
  if (!actionId || !z.string().uuid().safeParse(actionId).success) return NextResponse.json({ error: 'bishopricActionId is required', code: 'VALIDATION_ERROR' }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result = await client.query(
      `SELECT n.id, n.note_text, n.visibility, n.created_at, n.updated_at, n.created_by_user_id, COALESCE(u.display_name, u.email) AS created_by_name
         FROM internal_note n
         JOIN bishopric_action ba ON ba.id = n.bishopric_action_id AND ba.ward_id = n.ward_id
         LEFT JOIN user_account u ON u.id = n.created_by_user_id
        WHERE n.ward_id = $1::uuid AND n.bishopric_action_id = $2::uuid AND n.visibility IN ('LEADERSHIP', 'PRIVATE')
        ORDER BY n.created_at DESC`, [wardId, actionId]
    );
    await client.query('COMMIT');
    return NextResponse.json({ notes: result.rows });
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    return NextResponse.json({ error: 'Failed to load leadership notes', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const parsed = createNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid note payload', code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    if (!(await targetExists(client, wardId, parsed.data.target))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Note target not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (parsed.data.visibility === 'PUBLIC' && parsed.data.target.type !== 'PROGRAM_ITEM') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Public notes must belong to a program item', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    if (parsed.data.visibility === 'PUBLIC' && parsed.data.target.type === 'PROGRAM_ITEM') {
      const existingPublic = await client.query(
        "SELECT id FROM internal_note WHERE program_item_id = $1::uuid AND ward_id = $2::uuid AND visibility = 'PUBLIC' LIMIT 1",
        [parsed.data.target.programItemId, wardId]
      );
      if (existingPublic.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'A public note already exists for this program item', code: 'CONFLICT' }, { status: 409 });
      }
    }

    const target = targetColumns(parsed.data.target);
    const inserted = await client.query(
      `INSERT INTO internal_note (
        ward_id, member_id, meeting_id, program_item_id, bishopric_action_id, visibility, note_text, created_by_user_id
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text, $7::text, $8::uuid
      ) RETURNING id, created_at`,
      [wardId, target.memberId, target.meetingId, target.programItemId, target.bishopricActionId, parsed.data.visibility, parsed.data.noteText, session.user.id]
    );

    if (parsed.data.visibility === 'PUBLIC' && parsed.data.target.type === 'PROGRAM_ITEM') {
      await client.query('UPDATE meeting_program_item SET program_notes = $1::text WHERE id = $2::uuid AND ward_id = $3::uuid', [
        parsed.data.noteText,
        parsed.data.target.programItemId,
        wardId
      ]);
    }

    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name ?? session.user.email ?? null,
      action: 'INTERNAL_NOTE_CREATED',
      entityType: 'internal_note',
      entityId: inserted.rows[0].id,
      details: { targetType: parsed.data.target.type, visibility: parsed.data.visibility },
      source: 'manual_ui'
    });

    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId,
      aggregateType: 'internal_note',
      aggregateId: inserted.rows[0].id,
      eventType: 'NOTE_CREATED',
      payload: { noteId: inserted.rows[0].id }
    });

    await client.query('COMMIT');

    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);
    return NextResponse.json({ id: inserted.rows[0].id, createdAt: inserted.rows[0].created_at }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('internal_note_create_failed', { wardId, userId: session.user.id, error });
    return NextResponse.json({ error: 'Failed to save note', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
