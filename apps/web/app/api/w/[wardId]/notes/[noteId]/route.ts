import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canUseInternalNotes } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';

const updateNoteSchema = z.object({ noteText: z.string().trim().min(1).max(10000) });

export async function PUT(request: Request, context: { params: Promise<{ wardId: string; noteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, noteId } = await context.params;
  if (!canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }
  const parsed = updateNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid note payload', code: 'VALIDATION_ERROR' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const existing = await client.query(
      'SELECT id, visibility, note_text, program_item_id, created_by_user_id FROM internal_note WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
      [noteId, wardId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Note not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const note = existing.rows[0] as { visibility: string; note_text: string; program_item_id: string | null; created_by_user_id: string };
    const mayEdit =
      note.created_by_user_id === session.user.id ||
      (note.visibility === 'LEADERSHIP' && canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId));
    if (!mayEdit) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    await client.query('UPDATE internal_note SET note_text = $1::text, updated_at = now() WHERE id = $2::uuid AND ward_id = $3::uuid', [
      parsed.data.noteText,
      noteId,
      wardId
    ]);
    if (note.visibility === 'PUBLIC' && note.program_item_id) {
      await client.query('UPDATE meeting_program_item SET program_notes = $1::text WHERE id = $2::uuid AND ward_id = $3::uuid', [
        parsed.data.noteText,
        note.program_item_id,
        wardId
      ]);
    }
    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name ?? session.user.email ?? null,
      action: 'INTERNAL_NOTE_UPDATED',
      entityType: 'internal_note',
      entityId: noteId,
      details: {},
      source: 'manual_ui'
    });
    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId,
      aggregateType: 'internal_note',
      aggregateId: noteId,
      eventType: 'NOTE_UPDATED',
      payload: { noteId }
    });
    await client.query('COMMIT');
    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);
    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to update note', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
