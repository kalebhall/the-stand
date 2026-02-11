import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  canManageMeetingsMock,
  setDbContextMock,
  queryMock,
  releaseMock,
  connectMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageMeetingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { POST } from './route';

describe('POST /api/w/[wardId]/meetings/[meetingId]/publish', () => {
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
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'meeting-1', meeting_date: '2026-01-04', meeting_type: 'SACRAMENT' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ item_type: 'OPENING_HYMN', title: null, notes: null, hymn_number: '1', hymn_title: 'The Morning Breaks' }] })
      .mockResolvedValueOnce({ rows: [{ latest_version: 1 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
  });

  it('creates a new immutable render version and marks meeting as published', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, meetingId: 'meeting-1', version: 2, status: 'PUBLISHED' });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_program_render'), ['ward-1', 'meeting-1', 2, expect.any(String)]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("SET status = 'PUBLISHED'"), ['meeting-1', 'ward-1']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('MEETING_REPUBLISHED'), ['ward-1', 'user-1', 'MEETING_REPUBLISHED', 'meeting-1', 2]);
    expect(releaseMock).toHaveBeenCalled();
  });
});
