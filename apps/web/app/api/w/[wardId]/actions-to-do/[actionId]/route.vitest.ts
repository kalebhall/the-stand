import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageMeetingsMock, isWardModuleEnabledMock, setDbContextMock, queryMock, releaseMock, connectMock, recordAuditEventMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageMeetingsMock: vi.fn(),
  isWardModuleEnabledMock: vi.fn(),
  setDbContextMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn(),
  recordAuditEventMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: isWardModuleEnabledMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: recordAuditEventMock }));

describe('Actions to Do status route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', name: 'Bishop', roles: ['BISHOPRIC_EDITOR'] }, activeWardId: 'ward-1' });
    canManageMeetingsMock.mockReturnValue(true);
    isWardModuleEnabledMock.mockResolvedValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    recordAuditEventMock.mockResolvedValue(undefined);
  });

  it('links completed priesthood actions back to the membership handoff and audits the change', async () => {
    const { PATCH } = await import('./route');
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'follow-up-1', family: 'PRIESTHOOD', action_type: 'PRIESTHOOD_ORDINATION', status: 'COMPLETED', member_name: 'John Doe', membership_ordinance_id: 'ordinance-1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'ordinance-1' }] })
      .mockResolvedValueOnce({});

    const response = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }),
      { params: Promise.resolve({ wardId: 'ward-1', actionId: 'follow-up-1' }) }
    );

    expect(response.status).toBe(200);
    expect(queryMock.mock.calls[2]?.[0]).toContain("lcr_follow_up_status = 'completed'");
    expect(recordAuditEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CHURCH_ACTION_FOLLOW_UP_COMPLETED', entityId: 'follow-up-1' }));
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });
});
