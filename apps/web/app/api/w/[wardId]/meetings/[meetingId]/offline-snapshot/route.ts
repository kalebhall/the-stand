import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isAnnouncementActiveForDate } from '@/src/announcements/types';
import { buildStandRows } from '@/src/stand/render';
import type { IntroductionRoles } from '@/src/meetings/types';

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
    const meeting = await client.query(
      'SELECT id, meeting_date, meeting_type FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
      [meetingId, wardId]
    );
    if (!meeting.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const items = await client.query(
      `SELECT i.id, i.item_type, i.title, i.notes, i.program_notes, i.hymn_number, i.hymn_title, i.introduction_roles,
              m.first_name, m.last_name, m.gender
         FROM meeting_program_item i
         LEFT JOIN member m ON m.ward_id = i.ward_id AND m.full_name = i.title AND m.archived_at IS NULL
        WHERE i.meeting_id = $1::uuid AND i.ward_id = $2::uuid
        ORDER BY i.sequence ASC`,
      [meetingId, wardId]
    );
    const template = await client.query(
      'SELECT welcome_text, sustain_template, release_template FROM ward_stand_template WHERE ward_id = $1::uuid LIMIT 1',
      [wardId]
    );
    const announcements = await client.query(
      `SELECT title, body, start_date, end_date, is_permanent, include_in_stand
         FROM announcement WHERE ward_id = $1::uuid AND include_in_stand = TRUE`,
      [wardId]
    );
    const business = await client.query(
      `SELECT b.id, b.member_name, b.calling_name, b.action_type, b.status, b.updated_at,
              m.first_name, m.last_name, m.gender
         FROM meeting_business_line b
         LEFT JOIN member m ON m.ward_id = b.ward_id AND m.full_name = b.member_name AND m.archived_at IS NULL
        WHERE b.meeting_id = $1::uuid AND b.ward_id = $2::uuid
        ORDER BY b.created_at ASC`,
      [meetingId, wardId]
    );
    const membershipActions = await client.query(
      `SELECT id, member_name, action_type, status, planned_date, interview_status, interview_date, interviewer_name, responsible_leader, lcr_follow_up_status, lcr_updated_at
         FROM meeting_membership_ordinance
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
        ORDER BY created_at ASC`,
      [meetingId, wardId]
    );
    const notes = await client.query(
      `SELECT note.id, note.visibility, note.note_text, note.created_at, note.updated_at
         FROM internal_note note
        WHERE note.ward_id = $1::uuid
          AND (note.meeting_id = $2::uuid OR note.program_item_id IN (SELECT id FROM meeting_program_item WHERE meeting_id = $2::uuid AND ward_id = $1::uuid))
          AND note.visibility = 'PRIVATE'
          AND note.created_by_user_id = $3::uuid
        ORDER BY note.created_at DESC`,
      [wardId, meetingId, session.user.id]
    );
    await client.query('COMMIT');

    const meetingDate = meeting.rows[0].meeting_date as string;
    const activeAnnouncements = announcements.rows.filter((item) =>
      isAnnouncementActiveForDate({ startDate: item.start_date, endDate: item.end_date, isPermanent: item.is_permanent }, meetingDate)
    );
    const standRows = buildStandRows(
      items.rows.map((item) => ({
        id: item.id,
        itemType: item.item_type,
        title: item.title,
        notes: item.notes,
        programNotes: item.program_notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title,
        introductionRoles: item.introduction_roles,
        member: { firstName: item.first_name, lastName: item.last_name, gender: item.gender }
      })),
      template.rows[0]
        ? {
            welcomeText: template.rows[0].welcome_text,
            sustainTemplate: template.rows[0].sustain_template,
            releaseTemplate: template.rows[0].release_template
          }
        : undefined,
      activeAnnouncements.map((item) => ({ title: item.title, body: item.body, includeInStand: item.include_in_stand }))
    );

    return NextResponse.json({
      userId: session.user.id,
      wardId,
      meeting: { id: meetingId, meetingDate, meetingType: meeting.rows[0].meeting_type },
      standRows,
      businessLines: business.rows.map((line) => ({
        id: line.id,
        memberName: line.member_name,
        callingName: line.calling_name,
        actionType: line.action_type,
        status: line.status,
        updatedAt: line.updated_at
      })),
      membershipActions: membershipActions.rows.map((action) => ({
        id: action.id,
        memberName: action.member_name,
        actionType: action.action_type,
        status: action.status,
        plannedDate: action.planned_date,
        interviewStatus: action.interview_status,
        interviewDate: action.interview_date,
        interviewerName: action.interviewer_name,
        responsibleLeader: action.responsible_leader,
        lcrFollowUpStatus: action.lcr_follow_up_status,
        lcrUpdatedAt: action.lcr_updated_at
      })),
      notes: notes.rows.map((note) => ({
        id: note.id,
        visibility: 'PRIVATE',
        noteText: note.note_text,
        createdAt: note.created_at,
        updatedAt: note.updated_at
      }))
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('offline_snapshot_failed', { wardId, meetingId, error });
    return NextResponse.json({ error: 'Failed to create offline snapshot', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
