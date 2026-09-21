import type { NotificationDigestFrequency } from './email-preferences';

const NOTIFICATION_QUEUE_NAME = 'notification-outbox';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

export type OutboxNotificationQueueJob = {
  kind: 'outbox-event';
  wardId: string;
  eventOutboxId: string;
};

export type NotificationDigestQueueJob = {
  kind: 'digest-delivery';
  wardId: string;
  recipientUserId: string;
  frequency: NotificationDigestFrequency;
  digestItemId: string;
  runAt: string;
};

export type GlobalOutboxNotificationQueueJob = {
  kind: 'global-outbox-event';
  globalEventOutboxId: string;
};

export type GlobalEmailDeliveryQueueJob = {
  kind: 'global-email-delivery';
  globalNotificationDeliveryId: string;
};

export type NotificationQueueJob = OutboxNotificationQueueJob | GlobalOutboxNotificationQueueJob | GlobalEmailDeliveryQueueJob | NotificationDigestQueueJob;

function getRedisConnectionUrl(): string {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

async function createBullMqQueue() {
  const { Queue } = await import('bullmq');
  return new Queue<NotificationQueueJob>(NOTIFICATION_QUEUE_NAME, {
    connection: { url: getRedisConnectionUrl() }
  });
}

export async function enqueueOutboxNotificationJob(payload: { wardId: string; eventOutboxId: string }): Promise<void> {
  if (process.env.E2E_TEST_MODE === '1') return;

  const queue = await createBullMqQueue();

  try {
    const jobId = `outbox:${payload.wardId}:${payload.eventOutboxId}`;
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'failed' || state === 'completed') {
        await existingJob.remove();
      } else {
        return;
      }
    }

    await queue.add(
      'process-outbox-event',
      {
        kind: 'outbox-event',
        wardId: payload.wardId,
        eventOutboxId: payload.eventOutboxId
      },
      {
        jobId,
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    );
  } finally {
    await queue.close();
  }
}

export async function enqueueGlobalNotificationJob(payload: { globalEventOutboxId: string }): Promise<void> {
  const queue = await createBullMqQueue();

  try {
    const jobId = `global-outbox:${payload.globalEventOutboxId}`;
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'failed' || state === 'completed') {
        await existingJob.remove();
      } else {
        return;
      }
    }

    await queue.add('process-global-outbox-event', { kind: 'global-outbox-event', globalEventOutboxId: payload.globalEventOutboxId }, {
      jobId,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 }
    });
  } finally {
    await queue.close();
  }
}
export async function enqueueGlobalEmailDeliveryJob(payload: { globalNotificationDeliveryId: string }): Promise<void> {
  const queue = await createBullMqQueue();
  try {
    const jobId = `global-email:${payload.globalNotificationDeliveryId}`;
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'failed' || state === 'completed') await existingJob.remove();
      else return;
    }
    await queue.add('process-global-email-delivery', { kind: 'global-email-delivery', globalNotificationDeliveryId: payload.globalNotificationDeliveryId }, {
      jobId,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 }
    });
  } finally {
    await queue.close();
  }
}

export async function enqueueDigestNotificationJob(payload: NotificationDigestQueueJob): Promise<void> {
  const queue = await createBullMqQueue();

  try {
    const delay = Math.max(0, new Date(payload.runAt).getTime() - Date.now());
    await queue.add('process-digest-delivery', payload, {
      jobId: `digest:${payload.digestItemId}`,
      delay,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000
      }
    });
  } finally {
    await queue.close();
  }
}

export { NOTIFICATION_QUEUE_NAME };
