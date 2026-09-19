import { Worker } from 'bullmq';

import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { processNotificationDigest } from '@/src/notifications/digests';
import { processGlobalEmailDelivery } from '@/src/notifications/global-email';
import { processGlobalOutboxEvent } from '@/src/notifications/global-runner';
import { enqueueDigestNotificationJob, enqueueGlobalEmailDeliveryJob, enqueueGlobalNotificationJob, enqueueOutboxNotificationJob, NOTIFICATION_QUEUE_NAME, type NotificationQueueJob } from '@/src/notifications/queue';
import { findPendingGlobalEmailDeliveries, findPendingGlobalOutboxEvents, findPendingOutboxEvents } from '@/src/notifications/recovery';
import { createDueSupportReminderEvents } from '@/src/notifications/support-reminders';
import { processOutboxEvent } from '@/src/notifications/runner';

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';
const WORKER_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

function getRedisConnectionUrl(): string {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

const worker = new Worker<NotificationQueueJob>(
  NOTIFICATION_QUEUE_NAME,
  async (job) => {
    const client = await pool.connect();

    if (job.data.kind === 'global-email-delivery') {
      try {
        await processGlobalEmailDelivery(client, job.data.globalNotificationDeliveryId);
      } finally {
        client.release();
      }
      return;
    }

    try {
      await client.query('BEGIN');
      let digestJobs = [] as Awaited<ReturnType<typeof processOutboxEvent>>;
      let emailDeliveryIds: string[] = [];
      if (job.data.kind === 'global-outbox-event') {
        emailDeliveryIds = await processGlobalOutboxEvent(client, job.data.globalEventOutboxId);
      } else {
        await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: job.data.wardId });
        if (job.data.kind === 'outbox-event') {
          digestJobs = await processOutboxEvent(client, { wardId: job.data.wardId, eventOutboxId: job.data.eventOutboxId });
        } else {
          await processNotificationDigest(client, {
            wardId: job.data.wardId,
            recipientUserId: job.data.recipientUserId,
            frequency: job.data.frequency
          });
        }
      }
      await client.query('COMMIT');
      for (const emailDeliveryId of emailDeliveryIds) {
        try {
          await enqueueGlobalEmailDeliveryJob({ globalNotificationDeliveryId: emailDeliveryId });
        } catch (error) {
          console.error('[notifications-worker] failed to enqueue global email delivery after commit', {
            globalNotificationDeliveryId: emailDeliveryId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      for (const digestJob of digestJobs) {
        try {
          await enqueueDigestNotificationJob(digestJob);
        } catch (error) {
          console.error('[notifications-worker] failed to enqueue digest job after commit', {
            digestItemId: digestJob.digestItemId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  {
    connection: { url: getRedisConnectionUrl() },
    concurrency: 10
  }
);

async function recoverPendingOutboxEvents(): Promise<void> {
  const client = await pool.connect();
  try {
    const events = await findPendingOutboxEvents(client);
    const globalEvents = await findPendingGlobalOutboxEvents(client);
    const globalEmailDeliveries = await findPendingGlobalEmailDeliveries(client);
    for (const event of events) {
      await enqueueOutboxNotificationJob(event);
    }
    for (const event of globalEvents) {
      await enqueueGlobalNotificationJob(event);
    }
    for (const delivery of globalEmailDeliveries) {
      await enqueueGlobalEmailDeliveryJob(delivery);
    }
    if (events.length > 0 || globalEvents.length > 0 || globalEmailDeliveries.length > 0) {
      console.info(`[notifications-worker] re-enqueued ${events.length + globalEvents.length + globalEmailDeliveries.length} pending notification job(s)`);
    }
  } catch (error) {
    console.error('[notifications-worker] pending outbox recovery failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    client.release();
  }
}

async function runSupportReminderSweep(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jobs = await createDueSupportReminderEvents(client);
    await client.query('COMMIT');
    for (const job of jobs) {
      try {
        await enqueueGlobalNotificationJob(job);
      } catch (error) {
        console.error('[notifications-worker] failed to enqueue support reminder after commit', {
          globalEventOutboxId: job.globalEventOutboxId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    if (jobs.length > 0) console.info(`[notifications-worker] created ${jobs.length} support reminder(s)`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[notifications-worker] support reminder sweep failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    client.release();
  }
}

const recoveryTimer = setInterval(() => {
  void recoverPendingOutboxEvents();
}, 10_000);
recoveryTimer.unref();
void recoverPendingOutboxEvents();

const reminderTimer = setInterval(() => {
  void runSupportReminderSweep();
}, 60_000);
reminderTimer.unref();
void runSupportReminderSweep();

worker.on('ready', () => {
  console.info(`[notifications-worker] ready on queue ${NOTIFICATION_QUEUE_NAME}`);
});

worker.on('failed', (job, error) => {
  console.error('[notifications-worker] job failed', {
    jobId: job?.id,
    kind: job?.data.kind,
    wardId: job?.data.kind === 'outbox-event' || job?.data.kind === 'digest-delivery' ? job.data.wardId : undefined,
    eventOutboxId: job?.data.kind === 'outbox-event' ? job.data.eventOutboxId : undefined,
    globalEventOutboxId: job?.data.kind === 'global-outbox-event' ? job.data.globalEventOutboxId : undefined,
    recipientUserId: job?.data.kind === 'digest-delivery' ? job.data.recipientUserId : undefined,
    digestItemId: job?.data.kind === 'digest-delivery' ? job.data.digestItemId : undefined,
    error: error.message
  });
});

worker.on('error', (error) => {
  console.error('[notifications-worker] worker error', { error: error.message });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    clearInterval(recoveryTimer);
    clearInterval(reminderTimer);
    await worker.close();
    await pool.end();
    process.exit(0);
  });
}
