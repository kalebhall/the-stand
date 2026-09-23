import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageMeetingsMock, setDbContextMock, connectMock, releaseMock, queryMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    canManageMeetingsMock: vi.fn(),
    setDbContextMock: vi.fn(),
    connectMock: vi.fn(),
    releaseMock: vi.fn(),
    queryMock: vi.fn()
  }));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock, canViewMeetings: vi.fn() }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));

import { POST } from './route';

describe('POST /api/w/[wardId]/meetings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageMeetingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // LOCK meeting_document
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] }) // INSERT meeting
      .mockResolvedValueOnce({}) // INSERT program item 1
      .mockResolvedValueOnce({}) // INSERT program item 2
      .mockResolvedValueOnce({}) // INSERT program item 3
      .mockResolvedValueOnce({}) // INSERT program item 4
      .mockResolvedValueOnce({ rows: [] }) // ward document settings
      .mockResolvedValueOnce({ rows: [] }) // default template
      .mockResolvedValueOnce({}) // INSERT meeting document
      .mockResolvedValueOnce({}) // INSERT audit_log
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] }) // notification outbox
      .mockResolvedValueOnce({}); // COMMIT
  });

  it('persists the Core meeting and program items without optional modules', async () => {
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meetingDate: '2026-01-04',
          meetingType: 'SACRAMENT',
          programItems: [
            { itemType: 'INTRODUCTION', title: '', notes: '', introductionRoles: { presiding: 'Bishop', conducting: 'Counselor', organist: 'Organist', chorister: 'Chorister' }, hymnNumber: '', hymnTitle: '' },
            { itemType: 'ANNOUNCEMENT', title: '', notes: '', hymnNumber: '', hymnTitle: '' },
            { itemType: 'OPENING_HYMN', title: '', notes: '', hymnNumber: '2', hymnTitle: 'The Spirit of God' },
            { itemType: 'SPEAKER', title: 'Jane Doe', notes: '', topic: 'Missionary report', hymnNumber: '', hymnTitle: '' }
          ]
        })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'meeting-1' });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_program_item'), expect.arrayContaining(['ward-1', 'meeting-1', 3, 'OPENING_HYMN']));
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_program_item'), expect.arrayContaining(['ward-1', 'meeting-1', 4, 'SPEAKER']));
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.arrayContaining(['ward-1', 'user-1', 'MEETING_CREATED']));
    expect(releaseMock).toHaveBeenCalled();
  });
});
