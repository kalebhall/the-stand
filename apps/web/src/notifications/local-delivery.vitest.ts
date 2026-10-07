import { afterEach, describe, expect, it, vi } from 'vitest';

import { processNotificationDelivery } from './local-delivery';

describe('local notification delivery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('claims and commits before sending a webhook, then finalizes in a separate transaction', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('', {
        status: 200,
        headers: { 'x-delivery-id': 'provider-delivery-1' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'delivery-1',
            delivery_status: 'pending',
            attempts: 0,
            channel: 'webhook',
            ward_id: 'ward-1',
            event_id: 'event-1',
            event_type: 'MEETING_COMPLETED',
            aggregate_type: 'meeting',
            aggregate_id: 'meeting-1',
            payload: { ok: true }
          }
        ]
      })
      .mockResolvedValue({});

    await processNotificationDelivery({ query: queryMock }, 'delivery-1', 'ward-1');

    const queries = queryMock.mock.calls.map(([query]) => query);
    expect(queries.indexOf('BEGIN')).toBeLessThan(queries.indexOf('COMMIT'));
    expect(queries.findIndex((query) => query.includes('FOR UPDATE SKIP LOCKED'))).toBeLessThan(
      queries.findIndex((query) => query.includes("SET delivery_status = 'processing'"))
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5678/webhook/the-stand',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'idempotency-key': 'notification-delivery:delivery-1' })
      })
    );
    expect(queries.filter((query) => query === 'BEGIN')).toHaveLength(2);
    expect(queries.findIndex((query) => query.includes("SET delivery_status = 'success'"))).toBeGreaterThan(queries.lastIndexOf('BEGIN'));
  });

  it('persists delivery failure after the external call without rolling back the claim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'delivery-1',
            delivery_status: 'failed',
            attempts: 2,
            channel: 'webhook',
            ward_id: 'ward-1',
            event_id: 'event-1',
            event_type: 'MEETING_COMPLETED',
            aggregate_type: 'meeting',
            aggregate_id: 'meeting-1',
            payload: {}
          }
        ]
      })
      .mockResolvedValue({});

    await expect(processNotificationDelivery({ query: queryMock }, 'delivery-1', 'ward-1')).resolves.toBeUndefined();

    const queries = queryMock.mock.calls.map(([query]) => query);
    expect(queries.filter((query) => query === 'BEGIN')).toHaveLength(2);
    expect(queries).toContainEqual(expect.stringContaining("SET delivery_status = 'failed'"));
    expect(queries.at(-1)).toBe('COMMIT');
  });
});
