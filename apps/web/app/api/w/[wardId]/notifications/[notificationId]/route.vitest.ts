import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewMeetingsMock, setDbContextMock, readMock, dismissMock, queryMock, releaseMock, connectMock } = vi.hoisted(() => ({
  authMock: vi.fn(), canViewMeetingsMock: vi.fn(), setDbContextMock: vi.fn(), readMock: vi.fn(), dismissMock: vi.fn(), queryMock: vi.fn(), releaseMock: vi.fn(), connectMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewMeetings: canViewMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/notifications/user-notifications', () => ({
  markUserNotificationRead: readMock,
  dismissUserNotification: dismissMock
}));

import { PATCH } from './route';

const wardId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const notificationId = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ wardId, notificationId }) };

function request(body: unknown) {
  return new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

describe('notification mutation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: userId, roles: ['STAND_ADMIN'] }, activeWardId: wardId });
    canViewMeetingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    readMock.mockResolvedValue(true);
    dismissMock.mockResolvedValue(true);
  });

  it('rejects invalid action and cross-ward path before database access', async () => {
    expect((await PATCH(request({ action: 'delete' }), context)).status).toBe(400);
    const crossWard = { params: Promise.resolve({ wardId: '44444444-4444-4444-8444-444444444444', notificationId }) };
    canViewMeetingsMock.mockReturnValueOnce(false);
    expect((await PATCH(request({ action: 'read' }), crossWard)).status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('marks only current recipient notification as read or dismissed', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    expect((await PATCH(request({ action: 'read' }), context)).status).toBe(200);
    expect(readMock).toHaveBeenCalledWith(expect.anything(), { wardId, recipientUserId: userId, notificationId });

    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    expect((await PATCH(request({ action: 'dismiss' }), context)).status).toBe(200);
    expect(dismissMock).toHaveBeenCalledWith(expect.anything(), { wardId, recipientUserId: userId, notificationId });
  });

  it('returns not found when notification is not owned by recipient', async () => {
    readMock.mockResolvedValueOnce(false);
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const response = await PATCH(request({ action: 'read' }), context);
    expect(response.status).toBe(404);
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });
});
