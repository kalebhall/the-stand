import { beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handler: undefined as ((job: unknown) => Promise<void>) | undefined,
  client: undefined as { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } | undefined,
  setDbContext: vi.fn(),
  processCoreEventOutbox: vi.fn(),
  recordCoreEventOutboxFailure: vi.fn(),
  sideEffectConnects: 0}));

vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_queue: string, handler: (job: unknown) => Promise<void>) {
      state.handler = handler;
    }

    on() {
      return this;
    }

    async close() {}
  }
}));

vi.mock('@/src/db/client', () => ({
  pool: {
    connect: vi.fn(async () => {
      if (state.sideEffectConnects < 2) {
        state.sideEffectConnects += 1;
        return { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
      }
      return state.client;
    })
  }
}));
vi.mock('@/src/db/context', () => ({ setDbContext: state.setDbContext }));
vi.mock('@/src/platform/events/outbox', () => ({
  isCoreEventOutboxType: (eventType: string) => eventType.startsWith('CORE_'),
  processCoreEventOutbox: state.processCoreEventOutbox,
  recordCoreEventOutboxFailure: state.recordCoreEventOutboxFailure
}));
vi.mock('@/src/notifications/queue', () => ({
  NOTIFICATION_QUEUE_NAME: 'notification-outbox',
  enqueueDigestNotificationJob: vi.fn(),
  enqueueGlobalEmailDeliveryJob: vi.fn(),
  enqueueGlobalNotificationJob: vi.fn(),
  enqueueOutboxNotificationJob: vi.fn()
}));
vi.mock('@/src/notifications/recovery', () => ({
  findPendingGlobalEmailDeliveries: vi.fn(async () => []),
  findPendingGlobalOutboxEvents: vi.fn(async () => []),
  findPendingOutboxEvents: vi.fn(async () => [])
}));
vi.mock('@/src/notifications/digests', () => ({ processNotificationDigest: vi.fn() }));
vi.mock('@/src/notifications/global-email', () => ({ processGlobalEmailDelivery: vi.fn() }));
vi.mock('@/src/notifications/global-runner', () => ({ processGlobalOutboxEvent: vi.fn() }));
vi.mock('@/src/notifications/runner', () => ({ processOutboxEvent: vi.fn() }));
vi.mock('@/src/notifications/support-reminders', () => ({ createDueSupportReminderEvents: vi.fn(async () => []) }));

describe('notifications worker Core failure bookkeeping', () => {
  beforeAll(async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379');
    vi.stubGlobal('setInterval', () => ({ unref: vi.fn() }));
    state.client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ event_type: 'CORE_MEETING_CREATED' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn()
    };
    state.processCoreEventOutbox.mockRejectedValue(new Error('handler failed'));
    await import('./worker-entry');
  });

  it('rolls back the handler transaction and records exactly one retry in a fresh transaction', async () => {
    await expect(state.handler?.({
      data: {
        kind: 'outbox-event',
        wardId: '11111111-1111-4111-8111-111111111111',
        eventOutboxId: '33333333-3333-4333-8333-333333333333'
      }
    })).rejects.toThrow('handler failed');

    const queries = state.client?.query.mock.calls.map(([query]) => query) ?? [];
    expect(queries).toEqual(['BEGIN', expect.stringContaining('SELECT event_type'), 'ROLLBACK', 'BEGIN', 'COMMIT']);
    expect(state.setDbContext).toHaveBeenCalledTimes(2);
    expect(state.recordCoreEventOutboxFailure).toHaveBeenCalledTimes(1);
    expect(state.recordCoreEventOutboxFailure).toHaveBeenCalledWith(expect.anything(), {
      wardId: '11111111-1111-4111-8111-111111111111',
      eventOutboxId: '33333333-3333-4333-8333-333333333333',
      errorMessage: 'handler failed'
    });
    expect(state.client?.release).toHaveBeenCalledOnce();
  });
});
