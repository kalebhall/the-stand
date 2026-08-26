import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageCallingsMock, setDbContextMock, enqueueOutboxNotificationJobMock, connectMock, releaseMock, queryMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    canManageCallingsMock: vi.fn(),
    setDbContextMock: vi.fn(),
    enqueueOutboxNotificationJobMock: vi.fn(),
    connectMock: vi.fn(),
    releaseMock: vi.fn(),
    queryMock: vi.fn()
  }));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageCallings: canManageCallingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/notifications/queue', () => ({ enqueueOutboxNotificationJob: enqueueOutboxNotificationJobMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { POST } from './route';

describe('POST /api/w/[wardId]/callings/[callingId]/set-apart', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageCallingsMock.mockReturnValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });

    queryMock
      .mockResolvedValueOnce({})  // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'calling-1', action_status: 'SUSTAINED' }] })  // SELECT calling status
      .mockResolvedValueOnce({})  // INSERT calling_action
      .mockResolvedValueOnce({})  // UPDATE calling_assignment (SET_APART deactivates)
      .mockResolvedValueOnce({ rows: [{ calling_name: 'Primary Teacher', organization: 'Primary', member_name: 'Jane Doe', member_id: 'm-1' }] }) // calling_assignment SELECT
      .mockResolvedValueOnce({})  // INSERT audit_log
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'event-1' }] })  // INSERT event_outbox RETURNING id
      .mockResolvedValueOnce({});  // COMMIT
  });

  it('queues set apart notification event with LCR instruction', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', callingId: 'calling-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'calling-1', status: 'SET_APART' });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.arrayContaining([
      'ward-1',
      'user-1',
      'CALLING_SET_APART'
    ]));

    expect(enqueueOutboxNotificationJobMock).toHaveBeenCalledWith({ wardId: 'ward-1', eventOutboxId: 'event-1' });
    expect(releaseMock).toHaveBeenCalled();
  });
});
