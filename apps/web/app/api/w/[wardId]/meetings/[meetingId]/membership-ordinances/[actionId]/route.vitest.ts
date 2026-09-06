import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageMeetingsMock, setDbContextMock, queryMock, releaseMock, connectMock, recordAuditEventMock } = vi.hoisted(() => ({
  authMock: vi.fn(), canManageMeetingsMock: vi.fn(), setDbContextMock: vi.fn(), queryMock: vi.fn(), releaseMock: vi.fn(), connectMock: vi.fn(), recordAuditEventMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: recordAuditEventMock }));
vi.mock('@/src/notifications/queue', () => ({ enqueueOutboxNotificationJob: vi.fn() }));
vi.mock('@/src/notifications/outbox', () => ({ enqueueNotificationOutboxEvent: vi.fn(), insertNotificationOutboxEvent: vi.fn() }));

import { DELETE } from './route';

describe('DELETE membership ordinance action audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', name: 'Bishop', roles: ['BISHOPRIC_EDITOR'] }, activeWardId: 'ward-1' });
    canManageMeetingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    recordAuditEventMock.mockResolvedValue(undefined);
  });

  it('records deleted action previous state before commit', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'action-1', member_name: 'Jane Doe', action_type: 'BABY_BLESSING', status: 'pending', interview_status: 'not_required', lcr_follow_up_status: 'not_applicable', official_system_follow_up_status: 'not_applicable' }] }).mockResolvedValueOnce({});
    const response = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1', actionId: 'action-1' }) });

    expect(response.status).toBe(200);
    expect(recordAuditEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'MEMBERSHIP_ORDINANCE_DELETED', previousState: expect.objectContaining({ member_name: 'Jane Doe' }), changes: { deleted: { old: false, new: true } } }));
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });
});
