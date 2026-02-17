import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type NoteBody = {
  noteText?: unknown;
};

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; memberId: string; noteId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, memberId, noteId } = await context.params;

  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as NoteBody;
  const noteText = typeof body.noteText === 'string' ? body.noteText.trim() : '';

  if (!noteText) {
    return NextResponse.json({ error: 'Note is required', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const noteResult = await client.query(
      `SELECT mn.id, m.full_name
         FROM member_note mn
         JOIN member m ON m.id = mn.member_id AND m.ward_id = mn.ward_id
        WHERE mn.id = $1
          AND mn.member_id = $2
          AND mn.ward_id = $3
        LIMIT 1`,
      [noteId, memberId, wardId]
    );

    if (!noteResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Note not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query('UPDATE member_note SET note_text = $1 WHERE id = $2 AND ward_id = $3', [noteText, noteId, wardId]);

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEMBER_NOTE_EDITED', jsonb_build_object('memberId', $3, 'memberName', $4, 'memberNoteId', $5))`,
      [wardId, session.user.id, memberId, noteResult.rows[0].full_name, noteId]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to edit note', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ wardId: string; memberId: string; noteId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, memberId, noteId } = await context.params;

  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const noteResult = await client.query(
      `SELECT mn.id, m.full_name
         FROM member_note mn
         JOIN member m ON m.id = mn.member_id AND m.ward_id = mn.ward_id
        WHERE mn.id = $1
          AND mn.member_id = $2
          AND mn.ward_id = $3
        LIMIT 1`,
      [noteId, memberId, wardId]
    );

    if (!noteResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Note not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query('DELETE FROM member_note WHERE id = $1 AND ward_id = $2', [noteId, wardId]);

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEMBER_NOTE_DELETED', jsonb_build_object('memberId', $3, 'memberName', $4, 'memberNoteId', $5))`,
      [wardId, session.user.id, memberId, noteResult.rows[0].full_name, noteId]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to delete note', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
