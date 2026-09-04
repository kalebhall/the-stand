import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewMeetingsMock, setDbContextMock, listMock, countMock, queryMock, releaseMock, connectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewMeetingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  listMock: vi.fn(),
  countMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewMeetings: canViewMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/notifications/user-notifications', () => ({ listUserNotifications: listMock, countUnreadUserNotifications: countMock }));

import { GET } from './route';

const wardId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ wardId }) };

describe('notification list route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: userId, roles: ['STAND_ADMIN'] }, activeWardId: wardId });
    canViewMeetingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    listMock.mockResolvedValue([{ id: 'notification-1' }]);
    countMock.mockResolvedValue(1);
  });

  it('requires authentication and ward access', async () => {
    authMock.mockResolvedValueOnce(null);
    expect((await GET(new Request('http://localhost'), context)).status).toBe(401);
    authMock.mockResolvedValueOnce({ user: { id: userId, roles: [] }, activeWardId: wardId });
    canViewMeetingsMock.mockReturnValueOnce(false);
    expect((await GET(new Request('http://localhost'), context)).status).toBe(403);
  });

  it('validates query filters before database access', async () => {
    const response = await GET(new Request('http://localhost/api?filter=bad&limit=nope'), context);
    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns recipient-scoped notifications and unread count', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost/api?filter=unread&category=MEETINGS&limit=25'), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notifications: [{ id: 'notification-1' }], unreadCount: 1 });
    expect(listMock).toHaveBeenCalledWith(expect.anything(), {
      wardId,
      recipientUserId: userId,
      filter: 'unread',
      category: 'MEETINGS',
      limit: 25
    });
    expect(countMock).toHaveBeenCalledWith(expect.anything(), { wardId, recipientUserId: userId });
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });
});
