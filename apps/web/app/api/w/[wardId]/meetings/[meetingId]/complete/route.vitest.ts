import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  canManageMeetingsMock,
  setDbContextMock,
  runNotificationWorkerForWardMock,
  connectMock,
  releaseMock,
  queryMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageMeetingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  runNotificationWorkerForWardMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/notifications/runner', () => ({ runNotificationWorkerForWard: runNotificationWorkerForWardMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { POST } from './route';

describe('POST /api/w/[wardId]/meetings/[meetingId]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageMeetingsMock.mockReturnValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });

    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { member_name: 'Jane Doe', calling_name: 'Primary President', action_type: 'SUSTAIN' },
          { member_name: 'John Doe', calling_name: 'Elders Quorum President', action_type: 'RELEASE' }
        ]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'event-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
  });

  it('completes meeting and writes announced lines into outbox payload', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      meetingId: 'meeting-1',
      eventOutboxId: 'event-1',
      announcedBusinessLineCount: 2
    });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("AND status = 'announced'"), ['ward-1', 'meeting-1']);

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO event_outbox'), [
      'ward-1',
      'meeting-1',
      JSON.stringify({
        meetingId: 'meeting-1',
        announcedBusinessLines: [
          { memberName: 'Jane Doe', callingName: 'Primary President', actionType: 'SUSTAIN' },
          { memberName: 'John Doe', callingName: 'Elders Quorum President', actionType: 'RELEASE' }
        ]
      })
    ]);

    expect(runNotificationWorkerForWardMock).toHaveBeenCalledWith(expect.anything(), 'ward-1');
    expect(releaseMock).toHaveBeenCalled();
  });
});
