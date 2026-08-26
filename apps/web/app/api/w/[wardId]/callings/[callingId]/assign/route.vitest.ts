import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageCallingsMock, setDbContextMock, connectMock, releaseMock, queryMock, loggerErrorMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageCallingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn(),
  loggerErrorMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageCallings: canManageCallingsMock }));
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

describe('POST /api/w/[wardId]/callings/[callingId]/assign', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageCallingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('converts a sustained calling to assigned and preserves history', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'calling-1', action_status: 'SUSTAINED' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ wardId: 'ward-1', callingId: 'calling-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'calling-1', status: 'ASSIGNED', previousStatus: 'SUSTAINED' });
    expect(queryMock.mock.calls[2]?.[1]).toEqual(['ward-1', 'calling-1', 'ASSIGNED']);
    expect(queryMock.mock.calls[3]?.[0]).toContain('UPDATE calling_assignment SET is_active = TRUE');
    expect(queryMock.mock.calls[4]?.[0]).toContain('SELECT ca.calling_name');
    expect(queryMock.mock.calls[5]?.[0]).toContain('INSERT INTO audit_log');
    expect(queryMock.mock.calls[5]?.[1]).toContain('CALLING_ASSIGNED');
    expect(releaseMock).toHaveBeenCalled();
  });

  it('returns 409 when the calling is already assigned', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'calling-1', action_status: 'ASSIGNED' }] })
      .mockResolvedValueOnce({});

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ wardId: 'ward-1', callingId: 'calling-1' })
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Calling is already assigned', code: 'ALREADY_ASSIGNED' });
    expect(releaseMock).toHaveBeenCalled();
  });
});
