import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageCallingsMock, setDbContextMock, connectMock, releaseMock, queryMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageCallingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageCallings: canManageCallingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { POST } from './route';

describe('POST /api/w/[wardId]/callings/[callingId]/sustain', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageCallingsMock.mockReturnValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });

    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'calling-1', action_status: 'EXTENDED' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ member_name: 'Jane Doe', calling_name: 'Primary President' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
  });

  it('adds sustained action and creates business line in upcoming meeting', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', callingId: 'calling-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'calling-1', status: 'SUSTAINED', meetingId: 'meeting-1' });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_business_line'), [
      'ward-1',
      'meeting-1',
      'Jane Doe',
      'Primary President'
    ]);
    expect(releaseMock).toHaveBeenCalled();
  });
});
