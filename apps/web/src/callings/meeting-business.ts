import type { PoolClient } from 'pg';

/**
 * Meeting types that cannot carry ward-business (sustain / release) lines.
 * Stake Conference and General Conference are conducted at the stake / church-wide
 * level; the ward does not conduct its own business during those meetings.
 */
const CONFERENCE_MEETING_TYPES = ['STAKE_CONFERENCE', 'GENERAL_CONFERENCE'] as const;
type ConferenceMeetingType = (typeof CONFERENCE_MEETING_TYPES)[number];

export function isConferenceMeetingType(meetingType: string): meetingType is ConferenceMeetingType {
  return CONFERENCE_MEETING_TYPES.includes(meetingType as ConferenceMeetingType);
}

/**
 * Queues a ward business line (SUSTAIN or RELEASE) for a calling on the next
 * upcoming ward-owned meeting (SACRAMENT, FAST_TESTIMONY, or WARD_CONFERENCE).
 *
 * STAKE_CONFERENCE and GENERAL_CONFERENCE meetings are skipped because the ward
 * does not conduct its own sustaining/releasing business during those meetings.
 *
 * If no eligible future meeting exists yet, a DRAFT SACRAMENT meeting is created
 * for the next upcoming Sunday so the business line is never silently dropped.
 *
 * Must be called inside an open transaction.
 *
 * @returns the meetingId the line was inserted into, or null if the
 *   calling_assignment row was not found.
 */
export async function queueCallingBusinessLine(
  client: PoolClient,
  {
    wardId,
    callingId,
    actionType
  }: {
    wardId: string;
    callingId: string;
    actionType: 'SUSTAIN' | 'RELEASE';
  }
): Promise<string | null> {
  // 1. Fetch assignment info
  const assignmentResult = await client.query(
    `SELECT member_name, calling_name FROM calling_assignment WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1`,
    [callingId, wardId]
  );

  if (!assignmentResult.rowCount) {
    return null;
  }

  const assignment = assignmentResult.rows[0] as { member_name: string; calling_name: string };

  // 2. Find the next upcoming ward-eligible meeting — skipping conference meetings.
  const meetingResult = await client.query(
    `SELECT id FROM meeting
      WHERE ward_id = $1::uuid
        AND meeting_date >= CURRENT_DATE
        AND meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')
      ORDER BY meeting_date ASC
      LIMIT 1
      FOR UPDATE`,
    [wardId]
  );

  let meetingId: string;

  if (!meetingResult.rowCount) {
    // 3. No eligible upcoming meeting — create a DRAFT SACRAMENT meeting for the
    // next upcoming Sunday.  If today is Sunday we schedule 7 days out so we
    // don't attach to a meeting that may already be in progress.
    const nextSundayResult = await client.query(
      `SELECT (CURRENT_DATE + CASE
         WHEN EXTRACT(DOW FROM CURRENT_DATE)::int = 0 THEN 7
         ELSE 7 - EXTRACT(DOW FROM CURRENT_DATE)::int
       END)::text AS next_sunday`
    );

    const nextSunday = (nextSundayResult.rows[0] as { next_sunday: string }).next_sunday;

    // Check if any meeting already exists on that Sunday (concurrent insert guard).
    const existingResult = await client.query(
      `SELECT id FROM meeting WHERE ward_id = $1::uuid AND meeting_date = $2::date ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [wardId, nextSunday]
    );

    if (existingResult.rowCount) {
      const existing = existingResult.rows[0] as { id: string; meeting_type?: string };
      if (isConferenceMeetingType(existing.meeting_type ?? '')) {
        // The only existing meeting on that Sunday is a conference — advance one more week.
        const nextNextSundayResult = await client.query(
          `SELECT ($1::date + 7)::text AS next_sunday`,
          [nextSunday]
        );
        const nextNextSunday = (nextNextSundayResult.rows[0] as { next_sunday: string }).next_sunday;
        const insertedMeeting = await client.query(
          `INSERT INTO meeting (ward_id, meeting_date, meeting_type, status)
           VALUES ($1::uuid, $2::date, 'SACRAMENT', 'DRAFT')
           RETURNING id`,
          [wardId, nextNextSunday]
        );
        meetingId = (insertedMeeting.rows[0] as { id: string }).id;
      } else {
        meetingId = existing.id;
      }
    } else {
      const insertedMeeting = await client.query(
        `INSERT INTO meeting (ward_id, meeting_date, meeting_type, status)
         VALUES ($1::uuid, $2::date, 'SACRAMENT', 'DRAFT')
         RETURNING id`,
        [wardId, nextSunday]
      );
      meetingId = (insertedMeeting.rows[0] as { id: string }).id;
    }
  } else {
    meetingId = (meetingResult.rows[0] as { id: string }).id;
  }

  // 4. Insert the business line
  await client.query(
    `INSERT INTO meeting_business_line (ward_id, meeting_id, member_name, calling_name, action_type, status)
     VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, 'pending')`,
    [wardId, meetingId, assignment.member_name, assignment.calling_name, actionType]
  );

  return meetingId;
}

/**
 * When a meeting is changed to a conference type (STAKE_CONFERENCE or
 * GENERAL_CONFERENCE), migrate any pending ward-business lines off that meeting
 * to the next eligible ward meeting.  If none exists, a DRAFT SACRAMENT meeting
 * is auto-created for the Sunday after the conference.
 *
 * Must be called inside an open transaction, AFTER the meeting row has already
 * been updated with its new meeting_type and meeting_date.
 *
 * @param meetingId    The meeting whose type just changed to a conference type.
 * @param newMeetingDate The meeting's new date (used to find the next Sunday).
 */
export async function migrateBusinessLinesOffConference(
  client: PoolClient,
  {
    wardId,
    meetingId,
    newMeetingDate
  }: {
    wardId: string;
    meetingId: string;
    newMeetingDate: string; // ISO date string e.g. '2025-04-06'
  }
): Promise<void> {
  // Check if there are any pending business lines on this meeting.
  const pendingLines = await client.query(
    `SELECT id FROM meeting_business_line
      WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND status = 'pending'`,
    [meetingId, wardId]
  );

  if (!pendingLines.rowCount) {
    // Nothing to migrate.
    return;
  }

  // Find the next eligible ward meeting after the conference date.
  const nextMeetingResult = await client.query(
    `SELECT id FROM meeting
      WHERE ward_id = $1::uuid
        AND meeting_date > $2::date
        AND meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')
      ORDER BY meeting_date ASC
      LIMIT 1
      FOR UPDATE`,
    [wardId, newMeetingDate]
  );

  let targetMeetingId: string;

  if (!nextMeetingResult.rowCount) {
    // No eligible meeting after the conference — create one for the next Sunday
    // after the conference date.
    const nextSundayResult = await client.query(
      `SELECT ($1::date + (7 - EXTRACT(DOW FROM $1::date)::int) % 7 + 7)::text AS next_sunday`,
      [newMeetingDate]
    );

    const nextSunday = (nextSundayResult.rows[0] as { next_sunday: string }).next_sunday;

    // Guard against concurrent insert.
    const existingResult = await client.query(
      `SELECT id, meeting_type FROM meeting
        WHERE ward_id = $1::uuid AND meeting_date = $2::date
        ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [wardId, nextSunday]
    );

    if (existingResult.rowCount) {
      const existing = existingResult.rows[0] as { id: string; meeting_type: string };
      if (isConferenceMeetingType(existing.meeting_type)) {
        // That Sunday is also a conference — go one more week.
        const nextNextSundayResult = await client.query(
          `SELECT ($1::date + 7)::text AS next_sunday`,
          [nextSunday]
        );
        const nextNextSunday = (nextNextSundayResult.rows[0] as { next_sunday: string }).next_sunday;
        const inserted = await client.query(
          `INSERT INTO meeting (ward_id, meeting_date, meeting_type, status)
           VALUES ($1::uuid, $2::date, 'SACRAMENT', 'DRAFT')
           RETURNING id`,
          [wardId, nextNextSunday]
        );
        targetMeetingId = (inserted.rows[0] as { id: string }).id;
      } else {
        targetMeetingId = existing.id;
      }
    } else {
      const inserted = await client.query(
        `INSERT INTO meeting (ward_id, meeting_date, meeting_type, status)
         VALUES ($1::uuid, $2::date, 'SACRAMENT', 'DRAFT')
         RETURNING id`,
        [wardId, nextSunday]
      );
      targetMeetingId = (inserted.rows[0] as { id: string }).id;
    }
  } else {
    targetMeetingId = (nextMeetingResult.rows[0] as { id: string }).id;
  }

  // Migrate all pending lines to the target meeting.
  await client.query(
    `UPDATE meeting_business_line
        SET meeting_id = $1::uuid
      WHERE meeting_id = $2::uuid AND ward_id = $3::uuid AND status = 'pending'`,
    [targetMeetingId, meetingId, wardId]
  );
}
