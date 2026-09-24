import { afterEach, describe, expect, it, vi } from 'vitest';

import { enqueueGlobalEmailDeliveryJob, enqueueGlobalNotificationJob, enqueueOutboxNotificationJob } from './queue';

describe('notification queue configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not attempt local Redis when REDIS_URL is not configured', async () => {
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('E2E_TEST_MODE', '');

    await expect(enqueueOutboxNotificationJob({ wardId: 'ward-1', eventOutboxId: 'event-1' })).resolves.toBeUndefined();
    await expect(enqueueGlobalNotificationJob({ globalEventOutboxId: 'global-1' })).resolves.toBeUndefined();
    await expect(enqueueGlobalEmailDeliveryJob({ globalNotificationDeliveryId: 'delivery-1' })).resolves.toBeUndefined();
  });

  it('enqueues and deduplicates a global notification job with configured Redis', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379');
    vi.stubEnv('E2E_TEST_MODE', '');
    const { Queue } = await import('bullmq');
    const queue = new Queue('notification-outbox', { connection: { url: 'redis://127.0.0.1:6379' } });

    try {
      const waitingBefore = (await queue.getJobCounts('waiting')).waiting;
      await enqueueGlobalNotificationJob({ globalEventOutboxId: 'queue-test-global-1' });
      await enqueueGlobalNotificationJob({ globalEventOutboxId: 'queue-test-global-1' });

      const job = await queue.getJob('global-outbox-queue-test-global-1');
      expect(job?.data).toEqual({ kind: 'global-outbox-event', globalEventOutboxId: 'queue-test-global-1' });
      expect((await queue.getJobCounts('waiting')).waiting).toBe(waitingBefore + 1);
    } finally {
      await queue.remove('global-outbox-queue-test-global-1');
      await queue.close();
    }
  });
});
