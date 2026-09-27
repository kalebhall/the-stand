import { Pool } from 'pg';

import { enqueueOutboxNotificationJob } from '../notifications/queue.ts';

const EVENT_BY_FAMILY = {
  CALLING: 'CALLING_ACTION_PENDING_REMINDER',
  MEMBERSHIP: 'MEMBERSHIP_ORDINANCE_LCR_NEEDED_REMINDER',
  PRIESTHOOD: 'MEMBERSHIP_ORDINANCE_LCR_NEEDED_REMINDER'
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const followUps = await client.query(
      `SELECT caf.id, caf.ward_id, caf.family, caf.action_type, caf.member_name, caf.description, caf.due_date
         FROM church_action_follow_up caf
        WHERE caf.status IN ('OPEN', 'IN_PROGRESS')
          AND caf.due_date IS NOT NULL
          AND caf.due_date < CURRENT_DATE
          AND NOT EXISTS (
            SELECT 1 FROM ward_module_enablement wme
             WHERE wme.ward_id = caf.ward_id
               AND wme.module_id = 'actions-to-do'
               AND wme.enabled = FALSE
          )
        ORDER BY caf.due_date ASC, caf.created_at ASC`,
      []
    );

    const jobs = [];
    for (const followUp of followUps.rows ?? []) {
      const eventType = EVENT_BY_FAMILY[followUp.family];
      if (!eventType) continue;
      const result = await client.query(
        `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1::uuid, 'church_action_follow_up', $2::uuid, $3::text, $4::jsonb)
         ON CONFLICT (ward_id, event_type, aggregate_id) DO NOTHING
         RETURNING id`,
        [
          followUp.ward_id,
          followUp.id,
          eventType,
          JSON.stringify({
            actionId: followUp.id,
            family: followUp.family,
            actionType: followUp.action_type,
            memberName: followUp.member_name,
            description: followUp.description,
            dueDate: followUp.due_date
          })
        ]
      );
      const eventId = result.rows?.[0]?.id;
      if (eventId) jobs.push({ wardId: followUp.ward_id, eventOutboxId: eventId });
    }
    await client.query('COMMIT');

    for (const job of jobs) await enqueueOutboxNotificationJob(job);
    console.info('[church-action-reminders] completed', { examined: followUps.rowCount ?? 0, created: jobs.length });
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
  console.error('[church-action-reminders] failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
