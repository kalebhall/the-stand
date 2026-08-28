import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewMeetingsMock, setDbContextMock, markAllMock, queryMock, releaseMock, connectMock } = vi.hoisted(() => ({
  authMock: vi.fn(), canViewMeetingsMock: vi.fn(), setDbContextMock: vi.fn(), markAllMock: vi.fn(), queryMock: vi.fn(), releaseMock: vi.fn(), connectMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewMeetings: canViewMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/notifications/user-notifications', () => ({ markAllUserNotificationsRead: markAllMock }));

import { POST } from './route';

const wardId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ wardId }) };

describe('mark-all-read route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: userId, roles: ['STAND_ADMIN'] }, activeWardId: wardId });
    canViewMeetingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    markAllMock.mockResolvedValue(3);
  });

  it('requires authentication and ward access', async () => {
    authMock.mockResolvedValueOnce(null);
    expect((await POST(new Request('http://localhost'), context)).status).toBe(401);
    canViewMeetingsMock.mockReturnValueOnce(false);
    expect((await POST(new Request('http://localhost'), context)).status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('marks only current user and ward notifications', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const response = await POST(new Request('http://localhost', { method: 'POST' }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, markedCount: 3 });
    expect(markAllMock).toHaveBeenCalledWith(expect.anything(), { wardId, recipientUserId: userId });
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });
});
