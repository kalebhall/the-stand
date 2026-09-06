import { Pool } from 'pg';

import { enqueueOutboxNotificationJob } from '../notifications/queue.ts';
import { getTechnologyReminderEndDate } from './technology-reminders.ts';

function readHorizonDays() {
  const value = process.env.TECHNOLOGY_REMINDER_HORIZON_DAYS;
  if (value === undefined) return 7;
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0 || days > 31) {
    throw new Error('TECHNOLOGY_REMINDER_HORIZON_DAYS must be an integer between 1 and 31');
  }
  return days;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const now = new Date();
  const endDate = getTechnologyReminderEndDate(now, readHorizonDays());
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const meetings = await client.query(
      `SELECT m.id, m.ward_id, m.meeting_date, m.meeting_type
         FROM meeting m
         LEFT JOIN meeting_technology_checklist tc
           ON tc.meeting_id = m.id AND tc.ward_id = m.ward_id
        WHERE m.meeting_date >= CURRENT_DATE
          AND m.meeting_date <= $1::date
          AND m.status != 'COMPLETED'
          AND (
            tc.id IS NULL OR tc.room_ready = FALSE OR tc.audio_ready = FALSE OR
            tc.stream_ready = FALSE OR tc.accessibility_checked = FALSE OR
            tc.recording_deletion_reminder = FALSE
          )
        ORDER BY m.meeting_date ASC`,
      [endDate]
    );

    const jobs = [];
    for (const meeting of meetings.rows ?? []) {
      const result = await client.query(
        `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1::uuid, 'meeting', $2::uuid, 'MEETING_TECHNOLOGY_REMINDER', $3::jsonb)
         ON CONFLICT (ward_id, event_type, aggregate_id) DO NOTHING
         RETURNING id`,
        [
          meeting.ward_id,
          meeting.id,
          JSON.stringify({
            meetingDate: meeting.meeting_date,
            meetingType: meeting.meeting_type,
            subject: `${meeting.meeting_date} ${meeting.meeting_type}`
          })
        ]
      );
      const eventId = result.rows?.[0]?.id;
      if (eventId) jobs.push({ wardId: meeting.ward_id, eventOutboxId: eventId });
    }
    await client.query('COMMIT');
    for (const job of jobs) await enqueueOutboxNotificationJob(job);
    console.info('[technology-reminders] completed', { examined: meetings.rowCount ?? 0, created: jobs.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  console.error('[technology-reminders] failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
