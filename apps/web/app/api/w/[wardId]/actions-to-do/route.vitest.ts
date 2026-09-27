import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewMeetingsMock, moduleEnabledMock, setDbContextMock, connectMock, releaseMock, queryMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewMeetingsMock: vi.fn(),
  moduleEnabledMock: vi.fn(),
  setDbContextMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewMeetings: canViewMeetingsMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));

import { GET } from './route';

describe('GET /api/w/[wardId]/actions-to-do', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canViewMeetingsMock.mockReturnValue(true);
    moduleEnabledMock.mockResolvedValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('denies unauthenticated access before checking the database', async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/w/ward-1/actions-to-do'), {
      params: Promise.resolve({ wardId: 'ward-1' })
    });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('denies cross-ward access before checking the database', async () => {
    canViewMeetingsMock.mockReturnValue(false);

    const response = await GET(new Request('http://localhost/api/w/ward-2/actions-to-do'), {
      params: Promise.resolve({ wardId: 'ward-2' })
    });

    expect(response.status).toBe(403);
    expect(moduleEnabledMock).not.toHaveBeenCalled();
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('denies direct access when the Actions to Do module is disabled', async () => {
    moduleEnabledMock.mockResolvedValue(false);

    const response = await GET(new Request('http://localhost/api/w/ward-1/actions-to-do'), {
      params: Promise.resolve({ wardId: 'ward-1' })
    });

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('sets the authenticated ward context before reading follow-ups', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ id: 'action-1' }] });

    const response = await GET(new Request('http://localhost/api/w/ward-1/actions-to-do?status=OPEN'), {
      params: Promise.resolve({ wardId: 'ward-1' })
    });

    expect(response.status).toBe(200);
    expect(setDbContextMock).toHaveBeenCalledWith(expect.anything(), { userId: 'user-1', wardId: 'ward-1' });
    expect(queryMock.mock.calls[1]?.[1]).toEqual(['ward-1', 'OPEN', null]);
    expect(releaseMock).toHaveBeenCalled();
  });
});
