import { describe, expect, it, vi } from 'vitest';

import {
  markNotificationDeliveryFailure,
  markNotificationDeliverySuccess,
  runNotificationWorkerForWard
} from './runner';

describe('notification worker runner', () => {
  it('creates pending delivery for next outbox event', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'event-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await runNotificationWorkerForWard({ query: queryMock }, 'ward-1');

    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining('FROM event_outbox'), ['ward-1']);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO notification_delivery'),
      ['ward-1', 'event-1']
    );
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE event_outbox'), ['event-1', 'ward-1']);
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
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining("status = 'processed'"), [
      'delivery-1',
      'ward-1'
    ]);
  });

  it('marks delivery failure and stores error for retry diagnostics', async () => {
    const queryMock = vi.fn().mockResolvedValue({});

    await markNotificationDeliveryFailure(
      { query: queryMock },
      { wardId: 'ward-1', deliveryId: 'delivery-1', errorMessage: 'webhook timeout' }
    );

    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining("delivery_status = 'failure'"), [
      'delivery-1',
      'ward-1',
      'webhook timeout'
    ]);
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining("status = 'failed'"), [
      'delivery-1',
      'ward-1',
      'webhook timeout'
    ]);
  });
});
