import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createNotificationMock,
  ensureDefaultsMock,
  formatNotificationMock,
  isKnownNotificationEventMock,
  resolveRecipientsMock,
  subscribedRecipientsMock
} = vi.hoisted(() => ({
  createNotificationMock: vi.fn(),
  ensureDefaultsMock: vi.fn().mockResolvedValue(undefined),
  formatNotificationMock: vi.fn((input) => input),
  isKnownNotificationEventMock: vi.fn().mockReturnValue(false),
  resolveRecipientsMock: vi.fn().mockResolvedValue([]),
  subscribedRecipientsMock: vi.fn().mockResolvedValue([])
}));

vi.mock('./recipients', () => ({
  isKnownNotificationEvent: isKnownNotificationEventMock,
  resolveNotificationRecipients: resolveRecipientsMock,
  getSubscribedRecipientIds: subscribedRecipientsMock
}));
vi.mock('./subscriptions', () => ({ ensureDefaultNotificationSubscriptions: ensureDefaultsMock }));
vi.mock('./user-notifications', () => ({ createUserNotification: createNotificationMock }));
vi.mock('./format', () => ({ formatUserNotification: formatNotificationMock }));

import { markNotificationDeliveryFailure, markNotificationDeliverySuccess, processOutboxEvent } from './runner';

describe('notification worker runner', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    isKnownNotificationEventMock.mockReturnValue(false);
    resolveRecipientsMock.mockResolvedValue([]);
    subscribedRecipientsMock.mockImplementation((_client, params) => Promise.resolve(params.channel === 'IN_APP' ? ['user-2'] : []));
    ensureDefaultsMock.mockClear();
    createNotificationMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists a pending webhook delivery without calling the webhook in the outbox transaction', async () => {
    const fetchMock = vi.mocked(fetch);
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
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'delivery-1', delivery_status: 'pending' }] })
      .mockResolvedValueOnce({});

    const result = await processOutboxEvent({ query: queryMock }, { wardId: 'ward-1', eventOutboxId: 'event-1' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.localDeliveryIds).toEqual(['delivery-1']);
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO notification_delivery'), ['ward-1', 'event-1']);
    expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining("SET status = 'processed'"), ['event-1', 'ward-1']);
  });

  it('creates subscribed recipient notifications before webhook delivery', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    isKnownNotificationEventMock.mockReturnValue(true);
    resolveRecipientsMock.mockResolvedValue(['user-2']);
    subscribedRecipientsMock.mockImplementation((_client, params) => Promise.resolve(params.channel === 'IN_APP' ? ['user-2'] : []));

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
            payload: {},
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

    expect(ensureDefaultsMock).toHaveBeenCalledWith(expect.anything(), { wardId: 'ward-1', userId: 'user-2' });
    expect(createNotificationMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ recipientUserId: 'user-2' }));
  });

  it('does not deliver private note events to webhook or email', async () => {
    isKnownNotificationEventMock.mockReturnValue(true);
    resolveRecipientsMock.mockResolvedValue([]);
    const fetchMock = vi.mocked(fetch);
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'event-1',
            aggregate_type: 'internal_note',
            aggregate_id: 'note-1',
            event_type: 'NOTE_CREATED',
            payload: { visibility: 'PRIVATE', actorUserId: 'user-1' },
            attempts: 0,
            status: 'pending',
            available_now: true
          }
        ]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await processOutboxEvent({ query: queryMock }, { wardId: 'ward-1', eventOutboxId: 'event-1' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notification_delivery'), expect.anything());
    expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining("SET status = 'processed'"), ['event-1', 'ward-1']);
  });

  it('does not deliver leadership note events to the external webhook', async () => {
    isKnownNotificationEventMock.mockReturnValue(true);
    resolveRecipientsMock.mockResolvedValue([]);
    const fetchMock = vi.mocked(fetch);
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'event-1',
            aggregate_type: 'internal_note',
            aggregate_id: 'note-1',
            event_type: 'NOTE_CREATED',
            payload: { visibility: 'LEADERSHIP', actorUserId: 'user-1' },
            attempts: 0,
            status: 'pending',
            available_now: true
          }
        ]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await processOutboxEvent({ query: queryMock }, { wardId: 'ward-1', eventOutboxId: 'event-1' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining("SET status = 'processed'"), ['event-1', 'ward-1']);
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

    await markNotificationDeliverySuccess({ query: queryMock }, { wardId: 'ward-1', deliveryId: 'delivery-1', externalId: 'webhook-123' });

    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining("delivery_status = 'success'"), [
      'delivery-1',
      'ward-1',
      'webhook-123'
    ]);
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining("status = 'processed'"), ['delivery-1', 'ward-1']);
  });

  it('leaves recipient notifications committed when delivery is deferred', async () => {
    const fetchMock = vi.mocked(fetch);
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
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'delivery-1', delivery_status: 'pending' }] })
      .mockResolvedValueOnce({});

    const result = await processOutboxEvent({ query: queryMock }, { wardId: 'ward-1', eventOutboxId: 'event-1' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.localDeliveryIds).toEqual(['delivery-1']);
    expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining("SET status = 'processed'"), ['event-1', 'ward-1']);
  });

  it('does not resend a webhook with an existing successful delivery', async () => {
    const fetchMock = vi.mocked(fetch);
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
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'delivery-1', delivery_status: 'success' }] })
      .mockResolvedValueOnce({});

    await processOutboxEvent({ query: queryMock }, { wardId: 'ward-1', eventOutboxId: 'event-1' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining("SET status = 'processed'"), ['event-1', 'ward-1']);
  });

  it('marks delivery failure and schedules delivery retry', async () => {
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

    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining("delivery_status = 'failed'"), [
      'delivery-1',
      'ward-1',
      'webhook timeout',
      '10'
    ]);
  });
});
