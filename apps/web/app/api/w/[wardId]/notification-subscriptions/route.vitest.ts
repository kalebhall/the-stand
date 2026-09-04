import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  canViewMeetingsMock,
  setDbContextMock,
  getSubscriptionsMock,
  updateSubscriptionsMock,
  getEmailPreferenceMock,
  updateEmailPreferenceMock,
  queryMock,
  releaseMock,
  connectMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewMeetingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  getSubscriptionsMock: vi.fn(),
  updateSubscriptionsMock: vi.fn(),
  getEmailPreferenceMock: vi.fn(),
  updateEmailPreferenceMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewMeetings: canViewMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/notifications/subscriptions', () => ({
  getNotificationSubscriptions: getSubscriptionsMock,
  updateNotificationSubscriptions: updateSubscriptionsMock
}));
vi.mock('@/src/notifications/email-preferences', () => ({
  NOTIFICATION_EMAIL_FREQUENCIES: ['IMMEDIATE', 'DAILY', 'WEEKLY'],
  getNotificationEmailPreference: getEmailPreferenceMock,
  updateNotificationEmailPreference: updateEmailPreferenceMock,
  isValidIanaTimeZone: vi.fn(() => true)
}));

import { GET, PUT } from './route';

const wardId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function context() {
  return { params: Promise.resolve({ wardId }) };
}

function request(body: unknown) {
  return new Request('http://localhost', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  });
}

describe('notification subscription route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: userId, roles: ['STAND_ADMIN'] }, activeWardId: wardId });
    canViewMeetingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    getSubscriptionsMock.mockResolvedValue([{ eventType: 'MEETING_PUBLISHED' }]);
    updateSubscriptionsMock.mockResolvedValue([{ eventType: 'MEETING_PUBLISHED' }]);
    getEmailPreferenceMock.mockResolvedValue({ frequency: 'IMMEDIATE', timezone: 'UTC' });
    updateEmailPreferenceMock.mockResolvedValue({ frequency: 'IMMEDIATE', timezone: 'UTC' });
  });

  it('requires authentication and ward access', async () => {
    authMock.mockResolvedValueOnce(null);
    const unauthorized = await GET(new Request('http://localhost'), context());
    expect(unauthorized.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();

    authMock.mockResolvedValueOnce({ user: { id: userId, roles: [] }, activeWardId: wardId });
    canViewMeetingsMock.mockReturnValueOnce(false);
    const forbidden = await GET(new Request('http://localhost'), context());
    expect(forbidden.status).toBe(403);
  });

  it('loads subscriptions inside ward and user database context', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      subscriptions: [{ eventType: 'MEETING_PUBLISHED' }],
      emailPreference: { frequency: 'IMMEDIATE', timezone: 'UTC' }
    });
    expect(setDbContextMock).toHaveBeenCalledWith(expect.anything(), { wardId, userId });
    expect(getSubscriptionsMock).toHaveBeenCalledWith(expect.anything(), { wardId, userId });
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rejects malformed or unknown subscription updates before database access', async () => {
    const response = await PUT(request({ subscriptions: [{ eventType: 'NOT_REAL', channel: 'IN_APP', enabled: true }] }), context());

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('accepts a validated batch and commits idempotent updates', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const response = await PUT(
      request({
        emailPreference: { frequency: 'IMMEDIATE', timezone: 'UTC' },
        subscriptions: [
          { eventType: 'MEETING_PUBLISHED', channel: 'IN_APP', enabled: true },
          { eventType: 'MEETING_PUBLISHED', channel: 'EMAIL', enabled: false }
        ]
      }),
      context()
    );

    expect(response.status).toBe(200);
    expect(updateSubscriptionsMock).toHaveBeenCalledWith(expect.anything(), {
      wardId,
      userId,
      updates: [
        { eventType: 'MEETING_PUBLISHED', channel: 'IN_APP', enabled: true },
        { eventType: 'MEETING_PUBLISHED', channel: 'EMAIL', enabled: false }
      ]
    });
    expect(updateEmailPreferenceMock).toHaveBeenCalledWith(expect.anything(), { wardId, userId, frequency: 'IMMEDIATE', timezone: 'UTC' });
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rolls back and returns standard error when persistence fails', async () => {
    queryMock.mockResolvedValueOnce({});
    updateSubscriptionsMock.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await PUT(
      request({
        emailPreference: { frequency: 'IMMEDIATE', timezone: 'UTC' },
        subscriptions: [{ eventType: 'MEETING_PUBLISHED', channel: 'IN_APP', enabled: true }]
      }),
      context()
    );

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
    expect(queryMock).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
