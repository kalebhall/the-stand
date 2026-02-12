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
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'calling-1', action_status: 'SUSTAINED' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'event-1' }] })
      .mockResolvedValueOnce({});
  });

  it('queues set apart notification event with LCR instruction', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', callingId: 'calling-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'calling-1', status: 'SET_APART' });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("'CALLING_SET_APART'"), [
      'ward-1',
      'calling-1',
      JSON.stringify({
        callingAssignmentId: 'calling-1',
        instruction: 'Please record this set apart action in LCR.'
      })
    ]);

    expect(enqueueOutboxNotificationJobMock).toHaveBeenCalledWith({ wardId: 'ward-1', eventOutboxId: 'event-1' });
    expect(releaseMock).toHaveBeenCalled();
  });
});
