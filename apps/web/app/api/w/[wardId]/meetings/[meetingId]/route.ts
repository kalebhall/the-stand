import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { isConferenceMeetingType, migrateBusinessLinesOffConference } from '@/src/callings/meeting-business';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';

const logger = createLogger('meetings');
import { isMeetingType, type ProgramItemInput } from '@/src/meetings/types';

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type ProgramItemRow = {
  id: string;
  item_type: string;
  title: string | null;
  notes: string | null;
  program_notes: string | null;
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
      `SELECT id, item_type, title, notes, program_notes, hymn_number, hymn_title, sequence
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
          programNotes: item.program_notes ?? '',
          hymnNumber: item.hymn_number ?? '',
          hymnTitle: item.hymn_title ?? '',
          sequence: item.sequence
        }))
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to load meeting', { wardId, meetingId, error: err instanceof Error ? err.message : String(err) });
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

  const meetingDate = toTrimmedString(body?.meetingDate);
  const meetingType = toTrimmedString(body?.meetingType);
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

    // If the meeting was changed to a conference type, migrate any pending
    // ward-business lines (sustain/release) off this meeting to the next
    // eligible ward meeting.
    if (isConferenceMeetingType(meetingType)) {
      await migrateBusinessLinesOffConference(client, { wardId, meetingId, newMeetingDate: meetingDate });
    }

    const retainedIds = programItems.map((item) => toTrimmedString(item?.id)).filter(Boolean);
    await client.query(`DELETE FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND NOT (id = ANY($3::uuid[]))`, [meetingId, wardId, retainedIds]);

    for (const [index, item] of programItems.entries()) {
      const itemType = toTrimmedString(item?.itemType);
      if (!itemType) continue;
      const values = [wardId, meetingId, index + 1, itemType, toTrimmedString(item?.title), toTrimmedString(item?.notes), toTrimmedString(item?.programNotes), toTrimmedString(item?.hymnNumber), toTrimmedString(item?.hymnTitle)];
      if (item?.id && retainedIds.includes(item.id)) {
        await client.query(`UPDATE meeting_program_item SET sequence = $3::int, item_type = $4::text, title = NULLIF($5::text, ''), notes = NULLIF($6::text, ''), program_notes = NULLIF($7::text, ''), hymn_number = NULLIF($8::text, ''), hymn_title = NULLIF($9::text, '') WHERE id = $10::uuid AND meeting_id = $2::uuid AND ward_id = $1::uuid`, [...values, item.id]);
      } else {
        await client.query(`INSERT INTO meeting_program_item (ward_id, meeting_id, sequence, item_type, title, notes, program_notes, hymn_number, hymn_title) VALUES ($1::uuid, $2::uuid, $3::int, $4::text, NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, ''), NULLIF($8::text, ''), NULLIF($9::text, ''))`, values);
      }
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEETING_UPDATED', jsonb_build_object('meetingId', $3::text, 'programItemCount', $4::int))`,
      [wardId, session.user.id, meetingId, programItems.length]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('meeting_update_failed', { wardId, meetingId, userId: session.user.id, error });
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
       VALUES ($1, $2, 'MEETING_DELETED', jsonb_build_object('meetingId', $3::text))`,
      [wardId, session.user.id, meetingId]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to delete meeting', { wardId, meetingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to delete meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
