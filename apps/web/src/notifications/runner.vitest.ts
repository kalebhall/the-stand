import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markNotificationDeliveryFailure, markNotificationDeliverySuccess, processOutboxEvent } from './runner';

describe('notification worker runner', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates pending delivery for queued outbox event and sends webhook', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response('', {
        status: 200,
        headers: { 'x-delivery-id': 'webhook-123' }
      })
    );

    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'event-1',
            aggregate_type: 'meeting',
            aggregate_id: 'meeting-1',
            event_type: 'MEETING_COMPLETED',
            payload: { meetingId: 'meeting-1' },
            attempts: 0,
            status: 'pending',
            available_now: true
          }
        ]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'delivery-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await processOutboxEvent({ query: queryMock }, { wardId: 'ward-1', eventOutboxId: 'event-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5678/webhook/the-stand',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'idempotency-key': 'event-1' })
      })
    );

    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE ward_id = $1'), ['ward-1', 'event-1']);
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO notification_delivery'), [
      'ward-1',
      'event-1'
    ]);
  });

  it('returns when event is already processed', async () => {
    const queryMock = vi.fn().mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'event-1',
          aggregate_type: 'meeting',
          aggregate_id: 'meeting-1',
          event_type: 'MEETING_COMPLETED',
          payload: { meetingId: 'meeting-1' },
          attempts: 1,
          status: 'processed',
          available_now: true
        }
      ]
    });

    await processOutboxEvent({ query: queryMock }, { wardId: 'ward-1', eventOutboxId: 'event-1' });

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('marks delivery success and finalizes outbox event', async () => {
    const queryMock = vi.fn().mockResolvedValue({});

    await markNotificationDeliverySuccess(
      { query: queryMock },
      { wardId: 'ward-1', deliveryId: 'delivery-1', externalId: 'webhook-123' }
    );

    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining("delivery_status = 'success'"), [
      'delivery-1',
      'ward-1',
      'webhook-123'
    ]);
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining("status = 'processed'"), ['delivery-1', 'ward-1']);
  });

  it('marks delivery failure, schedules retry, and throws', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response('failed', { status: 500 }));

    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'event-1',
            aggregate_type: 'meeting',
            aggregate_id: 'meeting-1',
            event_type: 'MEETING_COMPLETED',
            payload: { meetingId: 'meeting-1' },
            attempts: 1,
            status: 'pending',
            available_now: true
          }
        ]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'delivery-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(
      processOutboxEvent({ query: queryMock }, { wardId: 'ward-1', eventOutboxId: 'event-1' })
    ).rejects.toThrow('Webhook delivery failed');

    expect(queryMock).toHaveBeenNthCalledWith(5, expect.stringContaining("SET status = 'pending'"), [
      'event-1',
      'ward-1',
      expect.stringContaining('Webhook delivery failed'),
      '10'
    ]);
  });

  it('marks delivery failure and schedules outbox retry', async () => {
    const queryMock = vi.fn().mockResolvedValue({});

    await markNotificationDeliveryFailure(
      { query: queryMock },
      {
        wardId: 'ward-1',
        deliveryId: 'delivery-1',
        eventOutboxId: 'event-1',
        attempts: 2,
        errorMessage: 'webhook timeout'
      }
    );

    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining("delivery_status = 'failure'"), [
      'delivery-1',
      'ward-1',
      'webhook timeout'
    ]);
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining('available_at = now()'), [
      'event-1',
      'ward-1',
      'webhook timeout',
      '10'
    ]);
  });
});
