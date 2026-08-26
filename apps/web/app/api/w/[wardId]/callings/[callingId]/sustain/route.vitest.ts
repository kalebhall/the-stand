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

    // setDbContext is mocked at module level (no-op).
    // sequence: BEGIN, fetchCurrentCallingStatus (FOR UPDATE query), appendCallingStatus (INSERT calling_action), calling_assignment SELECT, audit_log INSERT, COMMIT
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'calling-1', action_status: 'EXTENDED' }] }) // fetchCurrentCallingStatus
      .mockResolvedValueOnce({}) // appendCallingStatus INSERT calling_action
      .mockResolvedValueOnce({ rows: [{ calling_name: 'Primary Teacher', organization: 'Primary', member_name: 'Jane Doe', member_id: 'm-1' }] }) // calling_assignment SELECT
      .mockResolvedValueOnce({}) // audit_log INSERT
      .mockResolvedValueOnce({}); // COMMIT
  });

  it('records sustained status without creating a duplicate business line', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', callingId: 'calling-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'calling-1', status: 'SUSTAINED' });

    // Business line was already created when the calling was extended — not on sustain.
    const allCalls = queryMock.mock.calls.map((c: unknown[]) => c[0] as string);
    const businessLineCall = allCalls.find((q) => q.includes('meeting_business_line'));
    expect(businessLineCall).toBeUndefined();

    expect(releaseMock).toHaveBeenCalled();
  });
});
