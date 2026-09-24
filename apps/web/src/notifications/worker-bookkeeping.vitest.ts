import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createNotificationWorkerHandler } from './worker-handler';

const state = vi.hoisted(() => ({
  client: undefined as { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } | undefined,
  setDbContext: vi.fn(),
  processCoreEventOutbox: vi.fn(),
  recordCoreEventOutboxFailure: vi.fn()
}));

vi.mock('@/src/db/client', () => ({
  pool: {
    connect: vi.fn(async () => state.client)
  }
}));
vi.mock('@/src/db/context', () => ({ setDbContext: state.setDbContext }));
vi.mock('@/src/platform/events/outbox', () => ({
  isCoreEventOutboxType: (eventType: string) => eventType.startsWith('CORE_'),
  processCoreEventOutbox: state.processCoreEventOutbox,
  recordCoreEventOutboxFailure: state.recordCoreEventOutboxFailure
}));
vi.mock('@/src/notifications/queue', () => ({
  enqueueDigestNotificationJob: vi.fn(),
  enqueueGlobalEmailDeliveryJob: vi.fn()
}));
vi.mock('@/src/notifications/digests', () => ({ processNotificationDigest: vi.fn() }));
vi.mock('@/src/notifications/global-email', () => ({ processGlobalEmailDelivery: vi.fn() }));
vi.mock('@/src/notifications/global-runner', () => ({ processGlobalOutboxEvent: vi.fn() }));
vi.mock('@/src/notifications/runner', () => ({ processOutboxEvent: vi.fn() }));

describe('notifications worker Core failure bookkeeping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('rolls back the handler transaction and records exactly one retry in a fresh transaction', async () => {
    const handler = createNotificationWorkerHandler();

    await expect(handler({
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
