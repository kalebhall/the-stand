import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isMeetingType, type ProgramItemInput } from '@/src/meetings/types';

type ProgramItemRow = {
  id: string;
  item_type: string;
  title: string | null;
  notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
  sequence: number;
};

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const meetingResult = await client.query(
      'SELECT id, meeting_date, meeting_type, status FROM meeting WHERE id = $1 AND ward_id = $2 LIMIT 1',
      [meetingId, wardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const itemsResult = await client.query(
      `SELECT id, item_type, title, notes, hymn_number, hymn_title, sequence
         FROM meeting_program_item
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY sequence ASC`,
      [meetingId, wardId]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      meeting: {
        id: meetingResult.rows[0].id,
        meetingDate: meetingResult.rows[0].meeting_date,
        meetingType: meetingResult.rows[0].meeting_type,
        status: meetingResult.rows[0].status,
        programItems: (itemsResult.rows as ProgramItemRow[]).map((item) => ({
          id: item.id,
          itemType: item.item_type,
          title: item.title ?? '',
          notes: item.notes ?? '',
          hymnNumber: item.hymn_number ?? '',
          hymnTitle: item.hymn_title ?? '',
          sequence: item.sequence
        }))
      }
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    meetingDate?: string;
    meetingType?: string;
    programItems?: ProgramItemInput[];
  } | null;

  const meetingDate = body?.meetingDate?.trim() ?? '';
  const meetingType = body?.meetingType?.trim() ?? '';
  const programItems = Array.isArray(body?.programItems) ? body.programItems : [];

  if (!meetingDate || !isMeetingType(meetingType)) {
    return NextResponse.json({ error: 'Invalid meeting payload', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const updated = await client.query(
      `UPDATE meeting
          SET meeting_date = $1,
              meeting_type = $2,
              updated_at = now()
        WHERE id = $3 AND ward_id = $4
        RETURNING id`,
      [meetingDate, meetingType, meetingId, wardId]
    );

    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query('DELETE FROM meeting_program_item WHERE meeting_id = $1 AND ward_id = $2', [meetingId, wardId]);

    for (const [index, item] of programItems.entries()) {
      const itemType = item.itemType?.trim() ?? '';
      if (!itemType) continue;

      await client.query(
        `INSERT INTO meeting_program_item (ward_id, meeting_id, sequence, item_type, title, notes, hymn_number, hymn_title)
         VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''))`,
        [
          wardId,
          meetingId,
          index + 1,
          itemType,
          item.title?.trim() ?? '',
          item.notes?.trim() ?? '',
          item.hymnNumber?.trim() ?? '',
          item.hymnTitle?.trim() ?? ''
        ]
      );
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEETING_UPDATED', jsonb_build_object('meetingId', $3, 'programItemCount', $4))`,
      [wardId, session.user.id, meetingId, programItems.length]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to update meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const deleted = await client.query('DELETE FROM meeting WHERE id = $1 AND ward_id = $2 RETURNING id', [meetingId, wardId]);

    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEETING_DELETED', jsonb_build_object('meetingId', $3))`,
      [wardId, session.user.id, meetingId]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to delete meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
