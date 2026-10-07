import { describe, expect, it, vi } from 'vitest';

const { deliverNotificationEmailMock, formatNotificationEmailMock } = vi.hoisted(() => ({
  deliverNotificationEmailMock: vi.fn(),
  formatNotificationEmailMock: vi.fn()
}));

vi.mock('./email', () => ({
  deliverNotificationEmail: deliverNotificationEmailMock,
  formatNotificationEmail: formatNotificationEmailMock
}));

import { processGlobalEmailDelivery } from './global-email';

describe('global email delivery', () => {
  it('records provider success independently after formatting', async () => {
    formatNotificationEmailMock.mockReturnValue({ to: 'admin@example.com', subject: 'subject', text: 'text', html: '<p>text</p>' });
    deliverNotificationEmailMock.mockResolvedValue({ externalId: 'provider-1' });
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'delivery-1',
            delivery_status: 'pending',
            attempts: 0,
            is_active: true,
            email: 'admin@example.com',
            event_type: 'SUPPORT_REQUEST_CREATED',
            title: 'Support request created',
            summary: 'A new support work item requires attention.',
            target_url: '/support/queue',
            severity: 'info'
          }
        ]
      })
      .mockResolvedValue({});

    await processGlobalEmailDelivery({ query }, 'delivery-1');

    expect(deliverNotificationEmailMock).toHaveBeenCalledOnce();
    const successUpdate = query.mock.calls.find(([sql]) => String(sql).includes("delivery_status = 'success'"));
    expect(successUpdate?.[1]).toEqual(['delivery-1', 'provider-1', expect.any(String)]);
  });

  it('terminally skips unusable recipient addresses', async () => {
    formatNotificationEmailMock.mockReturnValue(null);
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'delivery-1',
            delivery_status: 'pending',
            attempts: 0,
            is_active: true,
            email: 'not-an-email',
            event_type: 'SUPPORT_REQUEST_CREATED',
            title: 'title',
            summary: 'summary',
            target_url: '/support/queue',
            severity: 'info'
          }
        ]
      })
      .mockResolvedValue({});

    await processGlobalEmailDelivery({ query }, 'delivery-1');

    expect(deliverNotificationEmailMock).not.toHaveBeenCalled();
    const skippedUpdate = query.mock.calls.find(([sql]) => String(sql).includes("delivery_status = 'skipped'"));
    expect(skippedUpdate?.[1]).toEqual(['delivery-1', expect.any(String)]);
  });
  it('records provider failure and rethrows for queue retry', async () => {
    formatNotificationEmailMock.mockReturnValue({ to: 'admin@example.com', subject: 'subject', text: 'text', html: '<p>text</p>' });
    deliverNotificationEmailMock.mockRejectedValue(new Error('provider unavailable'));
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'delivery-1',
            delivery_status: 'pending',
            attempts: 0,
            is_active: true,
            email: 'admin@example.com',
            event_type: 'SUPPORT_REQUEST_CREATED',
            title: 'title',
            summary: 'summary',
            target_url: '/support/queue',
            severity: 'info'
          }
        ]
      })
      .mockResolvedValue({});

    await expect(processGlobalEmailDelivery({ query }, 'delivery-1')).rejects.toThrow('provider unavailable');
    expect(query.mock.calls.some(([sql]) => String(sql).includes("delivery_status = 'failed'"))).toBe(true);
  });
});
