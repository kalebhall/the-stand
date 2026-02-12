import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type NoteBody = {
  noteText?: unknown;
};

export async function POST(request: Request, context: { params: Promise<{ wardId: string; memberId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, memberId } = await context.params;
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

    const memberResult = await client.query('SELECT id, full_name FROM member WHERE id = $1 AND ward_id = $2', [memberId, wardId]);
    if (!memberResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Member not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const inserted = await client.query(
      `INSERT INTO member_note (ward_id, member_id, note_text, created_by_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [wardId, memberId, noteText, session.user.id]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEMBER_NOTE_ADDED', jsonb_build_object('memberId', $3, 'memberName', $4, 'memberNoteId', $5))`,
      [wardId, session.user.id, memberId, memberResult.rows[0].full_name, inserted.rows[0].id]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      noteId: inserted.rows[0].id as string,
      createdAt: inserted.rows[0].created_at as string
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to add note', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
