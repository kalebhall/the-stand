import { Pool } from 'pg';

import { enqueueOutboxNotificationJob } from '../notifications/queue.ts';

const EVENT_BY_FAMILY = {
  CALLING: 'CALLING_ACTION_PENDING_REMINDER',
  MEMBERSHIP: 'MEMBERSHIP_ORDINANCE_LCR_NEEDED_REMINDER',
  PRIESTHOOD: 'MEMBERSHIP_ORDINANCE_LCR_NEEDED_REMINDER'
};

function requireMaintenanceUserId() {
  const userId = process.env.MAINTENANCE_USER_ID?.trim();
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('MAINTENANCE_USER_ID must be a UUID for an active user assigned to every maintenance ward');
  }
  return userId;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const maintenanceUserId = requireMaintenanceUserId();
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.user_id', $1::text, true)`, [maintenanceUserId]);
    const assignments = await client.query(
      `SELECT DISTINCT ward_id
         FROM ward_user_role
        WHERE user_id = $1::uuid AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())`,
      [maintenanceUserId]
    );

    const jobs = [];
    let examined = 0;
    for (const assignment of assignments.rows ?? []) {
      await client.query(`SELECT set_config('app.ward_id', $1::text, true)`, [assignment.ward_id]);
      const followUps = await client.query(
        `SELECT caf.id, caf.ward_id, caf.family, caf.action_type, caf.member_name, caf.description, caf.due_date
           FROM church_action_follow_up caf
          WHERE caf.ward_id = $1::uuid
            AND caf.status IN ('OPEN', 'IN_PROGRESS')
            AND caf.due_date IS NOT NULL
            AND caf.due_date < CURRENT_DATE
            AND NOT EXISTS (
              SELECT 1 FROM ward_module_enablement wme
               WHERE wme.ward_id = caf.ward_id
                 AND wme.module_id = 'actions-to-do'
                 AND wme.enabled = FALSE
            )
          ORDER BY caf.due_date ASC, caf.created_at ASC`,
        [assignment.ward_id]
      );
      examined += followUps.rowCount ?? 0;
      for (const followUp of followUps.rows ?? []) {
        const eventType = EVENT_BY_FAMILY[followUp.family];
        if (!eventType) continue;
        const result = await client.query(
          `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
           VALUES ($1::uuid, 'church_action_follow_up', $2::uuid, $3::text, $4::jsonb)
           ON CONFLICT (ward_id, event_type, aggregate_id) WHERE aggregate_type = 'church_action_follow_up' DO NOTHING
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
    }
    await client.query('COMMIT');

    for (const job of jobs) await enqueueOutboxNotificationJob(job);
    console.info('[church-action-reminders] completed', { wards: assignments.rowCount ?? 0, examined, created: jobs.length });
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
