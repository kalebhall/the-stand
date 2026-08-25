import type { PoolClient } from 'pg';

/**
 * Queues a ward business line (SUSTAIN or RELEASE) for a calling on the next
 * upcoming sacrament meeting for the ward.
 *
 * If no future meeting exists yet, a DRAFT SACRAMENT meeting is created for
 * the next upcoming Sunday so the business line is never silently dropped.
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

  // 2. Find the next upcoming meeting (any status: draft or published)
  let meetingResult = await client.query(
    `SELECT id FROM meeting WHERE ward_id = $1::uuid AND meeting_date >= CURRENT_DATE ORDER BY meeting_date ASC LIMIT 1 FOR UPDATE`,
    [wardId]
  );

  let meetingId: string;

  if (!meetingResult.rowCount) {
    // 3. No upcoming meeting — create a DRAFT SACRAMENT meeting for the next Sunday.
    // If today is Sunday (DOW=0), schedule for the following Sunday (7 days out)
    // so we don't silently attach to a meeting that may already be in progress.
    const nextSundayResult = await client.query(
      `SELECT (CURRENT_DATE + CASE
         WHEN EXTRACT(DOW FROM CURRENT_DATE)::int = 0 THEN 7
         ELSE 7 - EXTRACT(DOW FROM CURRENT_DATE)::int
       END)::text AS next_sunday`
    );

    const nextSunday = (nextSundayResult.rows[0] as { next_sunday: string }).next_sunday;

    // Check if a meeting for that date already exists (e.g. created between the
    // two queries under concurrent load, or a non-sacrament meeting on that Sunday).
    const existingResult = await client.query(
      `SELECT id FROM meeting WHERE ward_id = $1::uuid AND meeting_date = $2::date ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [wardId, nextSunday]
    );

    if (existingResult.rowCount) {
      meetingId = (existingResult.rows[0] as { id: string }).id;
    } else {
      const insertedMeeting = await client.query(
        `INSERT INTO meeting (ward_id, meeting_date, meeting_type, status)
         VALUES ($1::uuid, $2::date, 'SACRAMENT', 'DRAFT')
         RETURNING id`,
        [wardId, nextSunday]
      );
      meetingId = (insertedMeeting.rows[0] as { id: string }).id;
    }

    // Re-fetch to confirm (acts as our canonical meeting row)
    meetingResult = await client.query(
      `SELECT id FROM meeting WHERE id = $1::uuid FOR UPDATE`,
      [meetingId]
    );
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
