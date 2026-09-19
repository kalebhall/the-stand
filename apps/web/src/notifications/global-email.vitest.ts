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
    const query = vi.fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'delivery-1',
          delivery_status: 'pending',
          email: 'admin@example.com',
          event_type: 'SUPPORT_REQUEST_CREATED',
          title: 'Support request created',
          summary: 'A new support work item requires attention.',
          target_url: '/support/queue',
          severity: 'info'
        }]
      })
      .mockResolvedValueOnce({});

    await processGlobalEmailDelivery({ query }, 'delivery-1');

    expect(deliverNotificationEmailMock).toHaveBeenCalledOnce();
    expect(query.mock.calls[1]?.[0]).toContain("delivery_status = 'success'");
    expect(query.mock.calls[1]?.[1]).toEqual(['delivery-1', 'provider-1']);
  });

  it('records provider failure and rethrows for queue retry', async () => {
    formatNotificationEmailMock.mockReturnValue({ to: 'admin@example.com', subject: 'subject', text: 'text', html: '<p>text</p>' });
    deliverNotificationEmailMock.mockRejectedValue(new Error('provider unavailable'));
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'delivery-1', delivery_status: 'pending', email: 'admin@example.com', event_type: 'SUPPORT_REQUEST_CREATED', title: 'title', summary: 'summary', target_url: '/support/queue', severity: 'info' }] })
      .mockResolvedValueOnce({});

    await expect(processGlobalEmailDelivery({ query }, 'delivery-1')).rejects.toThrow('provider unavailable');
    expect(query.mock.calls[1]?.[0]).toContain("delivery_status = 'failed'");
  });
});
