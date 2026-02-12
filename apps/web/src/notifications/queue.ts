const NOTIFICATION_QUEUE_NAME = 'notification-outbox';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

export type NotificationQueueJob = {
  wardId: string;
  eventOutboxId: string;
};

function getRedisConnectionUrl(): string {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

async function createBullMqQueue() {
  const { Queue } = await import('bullmq');
  return new Queue<NotificationQueueJob>(NOTIFICATION_QUEUE_NAME, {
    connection: { url: getRedisConnectionUrl() }
  });
}

export async function enqueueOutboxNotificationJob(payload: NotificationQueueJob): Promise<void> {
  const queue = await createBullMqQueue();

  try {
    await queue.add('process-outbox-event', payload, {
      jobId: `${payload.wardId}:${payload.eventOutboxId}`,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });
  } finally {
    await queue.close();
  }
}

export { NOTIFICATION_QUEUE_NAME };
