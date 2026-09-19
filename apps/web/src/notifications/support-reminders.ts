import type { PoolClient } from 'pg';

import type { GlobalOutboxNotificationQueueJob } from '@/src/notifications/queue';

type DbClient = Pick<PoolClient, 'query'>;

function positiveHours(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function createDueSupportReminderEvents(client: DbClient): Promise<GlobalOutboxNotificationQueueJob[]> {
  const ageHours = positiveHours('SUPPORT_ASSIGNMENT_REMINDER_AFTER_HOURS', 24);
  const intervalHours = positiveHours('SUPPORT_ASSIGNMENT_REMINDER_INTERVAL_HOURS', 24);
  const maxReminders = Math.floor(positiveHours('SUPPORT_ASSIGNMENT_MAX_REMINDERS', 3));
  const result = await client.query(
    `WITH due_items AS (
       UPDATE support_work_item
          SET reminder_count = reminder_count + 1,
              last_reminded_at = now(),
              updated_at = now()
        WHERE status = 'UNASSIGNED'
          AND created_at <= now() - ($1::numeric * interval '1 hour')
          AND reminder_count < $2::int
          AND (last_reminded_at IS NULL OR last_reminded_at <= now() - ($3::numeric * interval '1 hour'))
        RETURNING id
     ), inserted_events AS (
       INSERT INTO global_event_outbox (aggregate_type, aggregate_id, event_type, payload)
       SELECT 'SUPPORT_WORK_ITEM', gen_random_uuid(), 'SUPPORT_REQUEST_REMINDER',
              jsonb_build_object('workItemId', id::text)
         FROM due_items
       RETURNING id
     )
     SELECT id AS "globalEventOutboxId" FROM inserted_events`,
    [ageHours, maxReminders, intervalHours]
  );

  return (result.rows as Array<{ globalEventOutboxId: string }>).map((row) => ({
    kind: 'global-outbox-event',
    globalEventOutboxId: row.globalEventOutboxId
  }));
}

