import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { canonicalizeMeeting, createMeetingContext, isMeetingStatus, isMeetingType } from '@/src/conducting/model';
import { renderBasicProgram } from '@/src/conducting/core';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, meetingId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meetingResult = await client.query(
      `SELECT m.id, m.meeting_date, m.meeting_type, m.status, w.name AS ward_name
         FROM meeting m JOIN ward w ON w.id = m.ward_id
        WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1`,
      [meetingId, wardId]
    );
    if (!meetingResult.rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const row = meetingResult.rows[0] as { id: string; meeting_date: string; meeting_type: string; status: string; ward_name: string };
    if (!isMeetingType(row.meeting_type) || !isMeetingStatus(row.status)) throw new Error('Meeting has an invalid canonical value.');
    const items = await client.query(
      `SELECT id, sequence, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, introduction_roles, speaker_status
         FROM meeting_program_item
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid ORDER BY sequence ASC`,
      [meetingId, wardId]
    );
    await client.query('COMMIT');

    const meeting = canonicalizeMeeting({
      id: row.id,
      wardId,
      meetingDate: String(row.meeting_date),
      meetingType: row.meeting_type,
      status: row.status,
      programItems: items.rows.map((item) => ({
        id: item.id,
        sequence: item.sequence,
        itemType: item.item_type,
        title: item.title,
        notes: item.notes,
        topic: item.topic,
        programNotes: item.program_notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title,
        introductionRoles: item.introduction_roles,
        speakerStatus: item.speaker_status
      }))
    });
    const coreContext = createMeetingContext(session.user.id, wardId, meeting);
    return new NextResponse(renderBasicProgram({ ...coreContext.meeting, wardName: row.ward_name }), {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to render program', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
