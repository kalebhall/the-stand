import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canRunImportsMock, setDbContextMock, connectMock, releaseMock, queryMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canRunImportsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn()
}));

const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canRunImports: canRunImportsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));
vi.mock('@/src/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock
  })
}));

import { POST } from './route';

describe('POST /api/w/[wardId]/imports/membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['MEMBERSHIP_CLERK'] }, activeWardId: 'ward-1' });
    canRunImportsMock.mockReturnValue(true);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('returns dry run preview without archiving or upserting', async () => {
    // BEGIN, INSERT import_run, COMMIT
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'import-1' }] })
      .mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      archived: 0,
      preview: [{ fullName: 'Jane Doe', firstName: 'Jane Doe', lastName: null, email: 'jane@example.com', phone: null, age: null, birthday: null, gender: null }]
    });

    // No UPDATE (archive) or INSERT INTO member calls during dry run
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(releaseMock).toHaveBeenCalled();
  });

  it('archives all active members then upserts parsed members on commit', async () => {
    // BEGIN, INSERT import_run, UPDATE archive-all, upsert Jane, upsert John, SELECT COUNT still-archived, INSERT audit_log, COMMIT
    queryMock
      .mockResolvedValueOnce({})                               // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'import-2' }] })  // INSERT import_run
      .mockResolvedValueOnce({ rowCount: 2 })                  // UPDATE archived_at = now()
      .mockResolvedValueOnce({ rows: [{ inserted: true }] })   // upsert Jane → new
      .mockResolvedValueOnce({ rows: [{ inserted: false }] })  // upsert John → existing
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })           // SELECT COUNT still-archived
      .mockResolvedValueOnce({})                               // INSERT audit_log
      .mockResolvedValueOnce({});                              // COMMIT

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      updated: 1,
      archived: 0
    });

    // Archive step: UPDATE member SET archived_at = now() WHERE ward_id = $1 AND archived_at IS NULL
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE member'),
      ['ward-1']
    );

    // Upsert includes archived_at = NULL to unarchive returning members
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO member'), [
      'ward-1',
      'Jane Doe',
      'Jane Doe', // firstName (no comma → whole name becomes firstName)
      null,       // lastName
      'jane@example.com',
      null,
      null,
      null,
      null
    ]);

    // Audit log includes archived count
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("'MEMBERSHIP_IMPORT_COMMITTED'"), [
      'ward-1',
      'user-1',
      'import-2',
      1,
      1,
      0,
      2
    ]);
  });

  it('writes failure details to audit log when import processing fails', async () => {
    queryMock
      .mockResolvedValueOnce({})                               // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'import-3' }] })  // INSERT import_run
      .mockRejectedValueOnce(new Error('db-archive-failed'))   // UPDATE archive step fails
      .mockResolvedValueOnce({})                               // ROLLBACK
      .mockResolvedValueOnce({})                               // BEGIN (audit fallback)
      .mockResolvedValueOnce({})                               // setDbContext noop
      .mockResolvedValueOnce({})                               // INSERT audit_log
      .mockResolvedValueOnce({});                              // COMMIT (audit fallback)

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawText: 'Jane Doe, jane@example.com', commit: true })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to import membership', code: 'INTERNAL_ERROR' });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("'MEMBERSHIP_IMPORT_FAILED'"), [
      'ward-1',
      'user-1',
      true,
      1,
      'db-archive-failed'
    ]);
    expect(loggerErrorMock).toHaveBeenCalledWith('Membership import request failed', {
      wardId: 'ward-1',
      userId: 'user-1',
      commitRequested: true,
      parsedCount: 1,
      fileName: 'paste',
      error: 'db-archive-failed'
    });
  });
});
