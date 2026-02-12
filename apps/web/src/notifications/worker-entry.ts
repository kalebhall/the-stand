import { Worker } from 'bullmq';

import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { NOTIFICATION_QUEUE_NAME } from '@/src/notifications/queue';
import { processOutboxEvent } from '@/src/notifications/runner';

type NotificationQueueJob = {
  wardId: string;
  eventOutboxId: string;
};

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';
const WORKER_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

function getRedisConnectionUrl(): string {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

const worker = new Worker<NotificationQueueJob>(
  NOTIFICATION_QUEUE_NAME,
  async (job) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: job.data.wardId });
      await processOutboxEvent(client, { wardId: job.data.wardId, eventOutboxId: job.data.eventOutboxId });
      await client.query('COMMIT');
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

worker.on('ready', () => {
  console.info(`[notifications-worker] ready on queue ${NOTIFICATION_QUEUE_NAME}`);
});

worker.on('failed', (job, error) => {
  console.error('[notifications-worker] job failed', {
    jobId: job?.id,
    wardId: job?.data.wardId,
    eventOutboxId: job?.data.eventOutboxId,
    error: error.message
  });
});

worker.on('error', (error) => {
  console.error('[notifications-worker] worker error', { error: error.message });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await worker.close();
    await pool.end();
    process.exit(0);
  });
}
