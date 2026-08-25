import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageCallingsMock, canViewCallingsMock, setDbContextMock, connectMock, releaseMock, queryMock, loggerErrorMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageCallingsMock: vi.fn(),
  canViewCallingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn(),
  loggerErrorMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageCallings: canManageCallingsMock, canViewCallings: canViewCallingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));
vi.mock('@/src/lib/logger', () => ({
  createLogger: () => ({ error: loggerErrorMock })
}));

import { POST } from './route';

describe('POST /api/w/[wardId]/callings', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageCallingsMock.mockReturnValue(true);
    canViewCallingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('creates a proposed calling by default', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'calling-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberName: 'Jane Doe', callingName: 'Primary Teacher' })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'calling-1', status: 'PROPOSED' });
    expect(queryMock.mock.calls[2]?.[1]).toEqual(['ward-1', 'calling-1', 'PROPOSED']);
    expect(queryMock.mock.calls[3]?.[1]).toEqual(['ward-1', 'user-1', 'CALLING_PROPOSED', 'calling-1']);
  });

  it('creates an assignment-only calling with assigned status', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'calling-2' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberName: 'John Doe', callingName: 'Ward Bulletin Specialist', isAssignmentOnly: true })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'calling-2', status: 'ASSIGNED' });
    expect(queryMock.mock.calls[2]?.[1]).toEqual(['ward-1', 'calling-2', 'ASSIGNED']);
    expect(queryMock.mock.calls[3]?.[1]).toEqual(['ward-1', 'user-1', 'CALLING_ASSIGNED', 'calling-2']);
    expect(releaseMock).toHaveBeenCalled();
  });
});
