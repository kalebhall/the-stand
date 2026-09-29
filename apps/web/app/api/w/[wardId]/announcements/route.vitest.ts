import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageMeetingsMock, canViewMeetingsMock, canManageProgramAnnouncementsMock, canManageStandAnnouncementsMock, canViewAnnouncementsMock, moduleEnabledMock, setDbContextMock, queryMock, releaseMock, connectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageMeetingsMock: vi.fn(),
  canViewMeetingsMock: vi.fn(),
  canManageProgramAnnouncementsMock: vi.fn(),
  canManageStandAnnouncementsMock: vi.fn(),
  canViewAnnouncementsMock: vi.fn(),
  moduleEnabledMock: vi.fn(),
  setDbContextMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({
  canManageMeetings: canManageMeetingsMock,
  canViewMeetings: canViewMeetingsMock,
  canManageProgramAnnouncements: canManageProgramAnnouncementsMock,
  canManageStandAnnouncements: canManageStandAnnouncementsMock,
  canViewAnnouncements: canViewAnnouncementsMock
}));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { GET, POST } from './route';

describe('GET and POST /api/w/[wardId]/announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({
      user: { id: 'user-1', roles: ['STAND_ADMIN'] },
      activeWardId: 'ward-1'
    });
    canViewMeetingsMock.mockReturnValue(true);
    canManageMeetingsMock.mockReturnValue(true);
    canViewAnnouncementsMock.mockReturnValue(true);
    canManageProgramAnnouncementsMock.mockReturnValue(true);
    canManageStandAnnouncementsMock.mockReturnValue(true);
    moduleEnabledMock.mockResolvedValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('lists announcements with program and stand flags', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'ann-1',
            title: 'Ward Temple Night',
            body: '7 PM session',
            start_date: '2026-09-01',
            end_date: null,
            is_permanent: false,
            placement: 'PROGRAM_TOP',
            include_in_program: true,
            include_in_stand: false,
            created_at: '2026-08-22T00:00:00Z'
          }
        ]
      })
      .mockResolvedValueOnce({}); // COMMIT

    const res = await GET(new Request('http://localhost/api/w/ward-1/announcements'), {
      params: Promise.resolve({ wardId: 'ward-1' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.announcements).toEqual([
      {
        id: 'ann-1',
        title: 'Ward Temple Night',
        body: '7 PM session',
        startDate: '2026-09-01',
        endDate: null,
        isPermanent: false,
        placement: 'PROGRAM_TOP',
        includeInProgram: true,
        includeInStand: false,
        createdAt: '2026-08-22T00:00:00Z'
      }
    ]);
  });

  it('forces Program Editor announcements to remain out of At the Stand', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-1' });
    canManageProgramAnnouncementsMock.mockReturnValue(true);
    canManageStandAnnouncementsMock.mockReturnValue(false);
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'ann-program' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await POST(new Request('http://localhost/api/w/ward-1/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Program only', includeInProgram: true, includeInStand: true })
    }), { params: Promise.resolve({ wardId: 'ward-1' }) });

    expect(res.status).toBe(201);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO announcement'), expect.arrayContaining([true, false]));
  });
  it('creates an announcement with default program true and stand false', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'ann-new' }] }) // INSERT announcement
      .mockResolvedValueOnce({}) // INSERT audit_log
      .mockResolvedValueOnce({}); // COMMIT

    const res = await POST(
      new Request('http://localhost/api/w/ward-1/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Stake Conference',
          body: 'Held at stake center',
          startDate: null,
          endDate: null,
          isPermanent: true,
          includeInProgram: true,
          includeInStand: true
        })
      }),
      {
        params: Promise.resolve({ wardId: 'ward-1' })
      }
    );

    expect(res.status).toBe(201);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO announcement'), [
      'ward-1',
      'Stake Conference',
      'Held at stake center',
      null,
      null,
      true,
      'PROGRAM_TOP',
      true,
      true
    ]);
  });
});
