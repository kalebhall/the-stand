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

describe('POST /api/w/[wardId]/imports/membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['MEMBERSHIP_CLERK'] }, activeWardId: 'ward-1' });
    canViewCallingsMock.mockReturnValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('returns dry run preview without member upserts', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ id: 'import-1' }] }).mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ rawText: 'Jane Doe, jane@example.com', commit: false })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      importRunId: 'import-1',
      commit: false,
      parsedCount: 1,
      inserted: 0,
      updated: 0,
      preview: [{ fullName: 'Jane Doe', email: 'jane@example.com', phone: null }]
    });

    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(releaseMock).toHaveBeenCalled();
  });

  it('commits parsed members into member table', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'import-2' }] })
      .mockResolvedValueOnce({ rows: [{ inserted: true }] })
      .mockResolvedValueOnce({ rows: [{ inserted: false }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ rawText: 'Jane Doe, jane@example.com\nJohn Doe, 801-555-0101', commit: true })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      importRunId: 'import-2',
      commit: true,
      parsedCount: 2,
      inserted: 1,
      updated: 1
    });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO member'), [
      'ward-1',
      'Jane Doe',
      'jane@example.com',
      null
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), [
      'ward-1',
      'user-1',
      'import-2',
      1,
      1,
      2
    ]);
  });
});
