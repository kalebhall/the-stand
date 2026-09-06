import { Pool } from 'pg';

import { enqueueOutboxNotificationJob } from '../notifications/queue.ts';
import { getInterviewReminderWindow } from './interview-reminders.ts';

const DEFAULT_HORIZON_HOURS = 24;

function readHorizonHours() {
  const value = process.env.INTERVIEW_REMINDER_HORIZON_HOURS;
  if (value === undefined) return DEFAULT_HORIZON_HOURS;
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours <= 0 || hours > 168) {
    throw new Error('INTERVIEW_REMINDER_HORIZON_HOURS must be an integer between 1 and 168');
  }
  return hours;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const window = getInterviewReminderWindow(new Date(), readHorizonHours());
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const interviews = await client.query(
      `SELECT id, ward_id, interview_type, member_name, interviewer_name, scheduled_at
         FROM scheduled_interview
        WHERE status = 'SCHEDULED'
          AND scheduled_at >= $1::timestamptz
          AND scheduled_at <= $2::timestamptz
        ORDER BY scheduled_at ASC`,
      [window.startsAt, window.endsAt]
    );

    const jobs = [];
    for (const interview of interviews.rows ?? []) {
      const result = await client.query(
        `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1::uuid, 'scheduled_interview', $2::uuid, 'INTERVIEW_REMINDER', $3::jsonb)
         ON CONFLICT (ward_id, event_type, aggregate_id) DO NOTHING
         RETURNING id`,
        [
          interview.ward_id,
          interview.id,
          JSON.stringify({
            memberName: interview.member_name,
            interviewType: interview.interview_type,
            interviewerName: interview.interviewer_name,
            scheduledAt: interview.scheduled_at
          })
        ]
      );
      const eventId = result.rows?.[0]?.id;
      if (eventId) jobs.push({ wardId: interview.ward_id, eventOutboxId: eventId });
    }
    await client.query('COMMIT');

    for (const job of jobs) {
      await enqueueOutboxNotificationJob(job);
    }
    console.info('[interview-reminders] completed', {
      examined: interviews.rowCount ?? 0,
      created: jobs.length
    });
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
  console.error('[interview-reminders] failed', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
}
