import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { buildMeetingRenderHtml } from '@/src/meetings/render';

type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
};

type ProgramItemRow = {
  item_type: string;
  title: string | null;
  notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
};

export async function POST(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
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

    const meetingResult = await client.query(
      `SELECT id, meeting_date, meeting_type
         FROM meeting
        WHERE id = $1 AND ward_id = $2
        LIMIT 1
        FOR UPDATE`,
      [meetingId, wardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const programResult = await client.query(
      `SELECT item_type, title, notes, hymn_number, hymn_title
         FROM meeting_program_item
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY sequence ASC`,
      [meetingId, wardId]
    );

    const versionResult = await client.query('SELECT COALESCE(MAX(version), 0)::int AS latest_version FROM meeting_program_render WHERE meeting_id = $1', [meetingId]);

    const nextVersion = Number(versionResult.rows[0].latest_version) + 1;
    const meeting = meetingResult.rows[0] as MeetingRow;
    const programItems = (programResult.rows as ProgramItemRow[]).map((item) => ({
      itemType: item.item_type,
      title: item.title,
      notes: item.notes,
      hymnNumber: item.hymn_number,
      hymnTitle: item.hymn_title
    }));

    const renderHtml = buildMeetingRenderHtml({
      meetingDate: meeting.meeting_date,
      meetingType: meeting.meeting_type,
      programItems
    });

    await client.query(
      `INSERT INTO meeting_program_render (ward_id, meeting_id, version, render_html)
       VALUES ($1, $2, $3, $4)`,
      [wardId, meetingId, nextVersion, renderHtml]
    );

    await client.query(
      `UPDATE meeting
          SET status = 'PUBLISHED',
              updated_at = now()
        WHERE id = $1 AND ward_id = $2`,
      [meetingId, wardId]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, $3, jsonb_build_object('meetingId', $4, 'version', $5))`,
      [wardId, session.user.id, nextVersion > 1 ? 'MEETING_REPUBLISHED' : 'MEETING_PUBLISHED', meetingId, nextVersion]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true, meetingId, version: nextVersion, status: 'PUBLISHED' });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to publish meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
