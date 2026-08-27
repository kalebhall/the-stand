import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewMeetingsMock, setDbContextMock, queryMock, releaseMock, connectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewMeetingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewMeetings: canViewMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { GET } from './route';

describe('GET /api/w/[wardId]/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({
      user: { id: 'user-1', roles: ['STAND_ADMIN'] },
      activeWardId: 'ward-1'
    });
    canViewMeetingsMock.mockReturnValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('rejects unauthorized requests', async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost/api/w/ward-1/members'), {
      params: Promise.resolve({ wardId: 'ward-1' })
    });

    expect(response.status).toBe(401);
  });

  it('rejects forbidden ward access', async () => {
    canViewMeetingsMock.mockReturnValueOnce(false);

    const response = await GET(new Request('http://localhost/api/w/ward-1/members'), {
      params: Promise.resolve({ wardId: 'ward-1' })
    });

    expect(response.status).toBe(403);
  });

  it('loads members matching multiple search tokens within transaction', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'm-1', full_name: 'Doe, John', age: 42 }]
      })
      .mockResolvedValueOnce({}); // COMMIT

    const response = await GET(new Request('http://localhost/api/w/ward-1/members?q=John+Doe'), {
      params: Promise.resolve({ wardId: 'ward-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [{ id: 'm-1', fullName: 'Doe, John', age: 42 }]
    });

    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('full_name ILIKE $2 AND full_name ILIKE $3'),
      ['ward-1', '%John%', '%Doe%', 50]
    );
    expect(queryMock).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(releaseMock).toHaveBeenCalled();
  });
});
