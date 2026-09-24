import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageMeetingsMock, setDbContextMock, connectMock, releaseMock, queryMock, insertCoreEventOutboxEventMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageMeetingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn(),
  insertCoreEventOutboxEventMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/platform/events/outbox', () => ({ insertCoreEventOutboxEvent: insertCoreEventOutboxEventMock }));

import { POST } from './route';

describe('POST /api/w/[wardId]/meetings/[meetingId]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageMeetingsMock.mockReturnValue(true);
    insertCoreEventOutboxEventMock.mockResolvedValue('core-event-1');
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'meeting-1', status: 'PUBLISHED' }] }) // locked meeting
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // announced business lines
      .mockResolvedValueOnce({}) // UPDATE meeting
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'event-1' }] }) // event outbox
      .mockResolvedValueOnce({}) // audit
      .mockResolvedValueOnce({}); // COMMIT
  });

  it('completes a published Core meeting without optional modules', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, meetingId: 'meeting-1', eventOutboxId: 'event-1', announcedBusinessLineCount: 0 });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('SET status = $3::text'), ['meeting-1', 'ward-1', 'COMPLETED']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO event_outbox'), [
      'ward-1', 'meeting-1', JSON.stringify({ meetingId: 'meeting-1', announcedBusinessLines: [] })
    ]);
    expect(releaseMock).toHaveBeenCalled();
  });
});
