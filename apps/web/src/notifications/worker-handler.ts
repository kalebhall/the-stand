import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { processNotificationDigest } from '@/src/notifications/digests';
import { processGlobalEmailDelivery } from '@/src/notifications/global-email';
import { processGlobalOutboxEvent } from '@/src/notifications/global-runner';
import { enqueueDigestNotificationJob, enqueueGlobalEmailDeliveryJob, type NotificationQueueJob } from '@/src/notifications/queue';
import { processOutboxEvent } from '@/src/notifications/runner';
import { processCoreEventOutbox, recordCoreEventOutboxFailure, isCoreEventOutboxType } from '@/src/platform/events/outbox';

const WORKER_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export function createNotificationWorkerHandler(): (job: { data: NotificationQueueJob }) => Promise<void> {
  return async (job) => {
    const client = await pool.connect();
    let coreEventJob: { wardId: string; eventOutboxId: string } | null = null;

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
          const eventTypeResult = await client.query(
            'SELECT event_type FROM event_outbox WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
            [job.data.eventOutboxId, job.data.wardId]
          );
          const eventType = eventTypeResult.rows[0]?.event_type as string | undefined;
          if (eventType && isCoreEventOutboxType(eventType)) {
            coreEventJob = { wardId: job.data.wardId, eventOutboxId: job.data.eventOutboxId };
            await processCoreEventOutbox(client, { wardId: job.data.wardId, eventOutboxId: job.data.eventOutboxId });
          } else {
            digestJobs = await processOutboxEvent(client, { wardId: job.data.wardId, eventOutboxId: job.data.eventOutboxId });
          }
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
      if (coreEventJob) {
        try {
          await client.query('BEGIN');
          await setDbContext(client, { userId: WORKER_SYSTEM_USER_ID, wardId: coreEventJob.wardId });
          await recordCoreEventOutboxFailure(client, {
            ...coreEventJob,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          await client.query('COMMIT');
        } catch (bookkeepingError) {
          await client.query('ROLLBACK');
          console.error('[notifications-worker] failed to persist Core outbox failure', {
            eventOutboxId: coreEventJob.eventOutboxId,
            error: bookkeepingError instanceof Error ? bookkeepingError.message : String(bookkeepingError)
          });
        }
      }
      throw error;
    } finally {
      client.release();
    }
  };
}
