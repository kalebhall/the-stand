import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewCallingsMock, setDbContextMock, connectMock, releaseMock, queryMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewCallingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewCallings: canViewCallingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { POST } from './route';

describe('POST /api/w/[wardId]/imports/callings', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['CLERK_EDITOR'] }, activeWardId: 'ward-1' });
    canViewCallingsMock.mockReturnValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('returns dry run preview and stale drift metadata', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'import-1', created_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 'assign-1', member_name: 'Jane Doe', calling_name: 'Ward Clerk', is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ member_name: 'Jane Doe', calling_name: 'Ward Clerk' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'import-older', raw_text: 'John Doe, Elders Quorum President' }]
      })
      .mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ rawText: 'Release: Jane Doe, Ward Clerk\nJohn Doe, Elders Quorum President', commit: false })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      importRunId: 'import-1',
      commit: false,
      parsedCount: 2,
      releaseCount: 1,
      activeCount: 1,
      stale: {
        isStale: true,
        driftCount: 2,
        comparedToImportRunId: 'import-older'
      }
    });
    expect(queryMock).toHaveBeenCalledTimes(6);
  });

  it('commits inserts and release updates', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'import-2', created_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 'assign-1', member_name: 'Jane Doe', calling_name: 'Ward Clerk', is_active: true }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ member_name: 'John Doe', calling_name: 'Executive Secretary' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ rawText: 'Release: Jane Doe, Ward Clerk\nJohn Doe, Executive Secretary', commit: true })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      importRunId: 'import-2',
      commit: true,
      inserted: 1,
      releasesApplied: 1,
      reactivated: 0
    });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE calling_assignment'), ['assign-1', 'ward-1']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO calling_assignment'), [
      'ward-1',
      'John Doe',
      'Executive Secretary'
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('CALLINGS_IMPORT_COMMITTED'), [
      'ward-1',
      'user-1',
      'import-2',
      1,
      0,
      1,
      2
    ]);
  });
});
