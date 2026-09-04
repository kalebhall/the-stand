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

import { DELETE } from './route';

describe('DELETE /api/w/[wardId]/callings/[callingId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageCallingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('deletes a calling and writes an audit log entry', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ member_name: 'Jane Doe', calling_name: 'Primary Teacher' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', callingId: 'calling-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(setDbContextMock).toHaveBeenCalledWith(expect.anything(), { userId: 'user-1', wardId: 'ward-1' });
    expect(queryMock.mock.calls[2]?.[0]).toContain('DELETE FROM calling_assignment');
    expect(queryMock.mock.calls[3]?.[0]).toContain('INSERT INTO audit_log');
    expect(queryMock.mock.calls[3]?.[1]).toContain('CALLING_DELETED');
    expect(releaseMock).toHaveBeenCalled();
  });

  it('returns 404 when the calling does not exist', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({});

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', callingId: 'missing-calling' })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Calling not found', code: 'NOT_FOUND' });
    expect(releaseMock).toHaveBeenCalled();
  });
});
