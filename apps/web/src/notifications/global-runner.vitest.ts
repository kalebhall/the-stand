import { describe, expect, it, vi } from 'vitest';

import { processGlobalOutboxEvent } from './global-runner';

describe('global notification runner', () => {
  it('creates one in-app notification and delivery per active global administrator', async () => {
    const queryMock = vi.fn();
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'event-1',
            aggregate_type: 'SUPPORT_WORK_ITEM',
            aggregate_id: 'work-1',
            event_type: 'SUPPORT_REQUEST_CREATED',
            payload: {},
            attempts: 0,
            status: 'pending',
            available_now: true
          }
        ]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'support-1' }, { id: 'system-1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'notification-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'notification-2' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await processGlobalOutboxEvent({ query: queryMock }, 'event-1');

    expect(queryMock.mock.calls[2]?.[0]).toContain("r.name IN ('SUPPORT_ADMIN', 'SYSTEM_ADMIN')");
    expect(queryMock.mock.calls[3]?.[0]).toContain('INSERT INTO global_user_notification');
    expect(queryMock.mock.calls[4]?.[0]).toContain('INSERT INTO global_notification_delivery');
    expect(queryMock.mock.calls[5]?.[1]?.[0]).toBe('system-1');
    expect(queryMock.mock.calls[7]?.[0]).toContain("status = 'processed'");
  });

  it('does not process an already completed event', async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ status: 'processed', available_now: true }]
    });

    await processGlobalOutboxEvent({ query: queryMock }, 'event-1');

    expect(queryMock).toHaveBeenCalledOnce();
  });
});
