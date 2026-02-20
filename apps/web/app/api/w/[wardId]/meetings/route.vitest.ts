import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageMeetingsMock, setDbContextMock, queryMock, releaseMock, connectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageMeetingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock, canViewMeetings: vi.fn() }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { POST } from './route';

describe('POST /api/w/[wardId]/meetings', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({
      user: { id: 'user-1', roles: ['STAND_ADMIN'] },
      activeWardId: 'ward-1'
    });
    canManageMeetingsMock.mockReturnValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });

    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] }) // INSERT meeting
      .mockResolvedValueOnce({}) // INSERT program item 1
      .mockResolvedValueOnce({}) // INSERT program item 2
      .mockResolvedValueOnce({}) // INSERT audit_log
      .mockResolvedValueOnce({}); // COMMIT
  });

  it('persists program items when creating a meeting', async () => {
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meetingDate: '2026-01-04',
          meetingType: 'SACRAMENT',
          programItems: [
            { itemType: 'OPENING_HYMN', title: '', notes: '', hymnNumber: '2', hymnTitle: 'The Spirit of God' },
            { itemType: 'SPEAKER', title: 'Jane Doe', notes: 'Missionary report', hymnNumber: '', hymnTitle: '' }
          ]
        })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'meeting-1' });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_program_item'), [
      'ward-1',
      'meeting-1',
      1,
      'OPENING_HYMN',
      '',
      '',
      '2',
      'The Spirit of God'
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_program_item'), [
      'ward-1',
      'meeting-1',
      2,
      'SPEAKER',
      'Jane Doe',
      'Missionary report',
      '',
      ''
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), [
      'ward-1',
      'user-1',
      'meeting-1',
      '2026-01-04',
      'SACRAMENT',
      2
    ]);
    expect(releaseMock).toHaveBeenCalled();
  });
});
