import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { isCoreAnnouncementActiveForDate } from '@/src/conducting/core';
import { buildStandRows } from '@/src/stand/render';

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, meetingId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }
  const technologyEnabled = await isWardModuleEnabled(wardId, session.user.id, 'technology-checklist');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meeting = await client.query(
      'SELECT m.id, m.meeting_date, m.meeting_type, w.default_locale FROM meeting m JOIN ward w ON w.id = m.ward_id WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1',
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
      `SELECT b.id, b.member_name, b.calling_name, b.action_type,
              CASE WHEN b.meeting_id <> $1::uuid THEN 'pending' ELSE b.status END AS status,
              b.updated_at, (b.meeting_id <> $1::uuid) AS carried_forward
         FROM meeting_business_line b
         JOIN meeting source_meeting ON source_meeting.id = b.meeting_id AND source_meeting.ward_id = b.ward_id
         LEFT JOIN LATERAL (
           SELECT action_status FROM calling_action ca
            WHERE ca.calling_assignment_id = b.calling_assignment_id AND ca.ward_id = b.ward_id
            ORDER BY ca.created_at DESC LIMIT 1
         ) latest_calling ON TRUE
        WHERE b.ward_id = $2::uuid
          AND source_meeting.meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')
          AND EXISTS (SELECT 1 FROM meeting route_meeting WHERE route_meeting.id = $1::uuid AND route_meeting.meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE'))
          AND (b.action_type <> 'SUSTAIN' OR b.calling_assignment_id IS NULL OR latest_calling.action_status = 'EXTENDED')
          AND (b.meeting_id = $1::uuid OR (b.action_type = 'SUSTAIN' AND b.calling_assignment_id IS NOT NULL AND source_meeting.meeting_date <= $3::date AND latest_calling.action_status = 'EXTENDED'))
        ORDER BY b.created_at ASC`,
      [meetingId, wardId, meeting.rows[0].meeting_date]
    );
    const membershipActions = await client.query(
      `SELECT a.id, a.member_name, a.action_type, a.priesthood_office,
              CASE WHEN a.meeting_id <> $1::uuid AND a.status = 'pending' THEN 'action_needed' ELSE a.status END AS status,
              a.planned_date, a.interview_status, a.baptism_date, a.confirmation_date, a.baptism_status, a.confirmation_status, a.responsible_leader, a.lcr_follow_up_status,
              (a.meeting_id <> $1::uuid) AS carried_forward
         FROM meeting_membership_ordinance a
         JOIN meeting source_meeting ON source_meeting.id = a.meeting_id AND source_meeting.ward_id = a.ward_id
        WHERE a.ward_id = $2::uuid
          AND source_meeting.meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')
          AND EXISTS (SELECT 1 FROM meeting route_meeting WHERE route_meeting.id = $1::uuid AND route_meeting.meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE'))
          AND (a.meeting_id = $1::uuid OR (source_meeting.meeting_date <= $3::date AND a.status <> 'completed'))
        ORDER BY a.created_at ASC`,
      [meetingId, wardId, meeting.rows[0].meeting_date]
    );
    const technology = technologyEnabled ? await client.query(
      `SELECT owner_name, room_ready, audio_ready, stream_ready, accessibility_checked, authorized_link, start_confirmed_at, stop_confirmed_at, recording_deletion_reminder
         FROM meeting_technology_checklist
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
        LIMIT 1`,
      [meetingId, wardId]
    ) : { rows: [] };
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
    const hymnLocale = meeting.rows[0].default_locale as string;
    const activeAnnouncements = announcements.rows.filter((item) =>
      isCoreAnnouncementActiveForDate({ startDate: item.start_date, endDate: item.end_date, isPermanent: item.is_permanent }, meetingDate)
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
        hymnLocale,
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
        carriedForward: line.carried_forward ?? false,
        updatedAt: line.updated_at
      })),
      membershipActions: membershipActions.rows.map((action) => ({
        id: action.id,
        memberName: action.member_name,
        actionType: action.action_type,
        priesthoodOffice: action.priesthood_office,
        status: action.status,
        plannedDate: action.planned_date,
        interviewStatus: action.interview_status,
        baptismDate: action.baptism_date,
        confirmationDate: action.confirmation_date,
        baptismStatus: action.baptism_status,
        confirmationStatus: action.confirmation_status,
        responsibleLeader: action.responsible_leader,
        lcrFollowUpStatus: action.lcr_follow_up_status,
        carriedForward: action.carried_forward ?? false
      })),
      technology: technology.rows[0]
        ? {
            ownerName: technology.rows[0].owner_name,
            roomReady: technology.rows[0].room_ready,
            audioReady: technology.rows[0].audio_ready,
            streamReady: technology.rows[0].stream_ready,
            accessibilityChecked: technology.rows[0].accessibility_checked,
            authorizedLink: technology.rows[0].authorized_link,
            startConfirmedAt: technology.rows[0].start_confirmed_at,
            stopConfirmedAt: technology.rows[0].stop_confirmed_at,
            recordingDeletionReminder: technology.rows[0].recording_deletion_reminder
          }
        : null,
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
