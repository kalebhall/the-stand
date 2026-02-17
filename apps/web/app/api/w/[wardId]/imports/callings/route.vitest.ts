import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewCallingsMock, setDbContextMock, connectMock, releaseMock, queryMock, extractPdfTextMock, parseCallingsPdfTextMock, makeMemberBirthdayKeyMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewCallingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  connectMock: vi.fn(),
  releaseMock: vi.fn(),
  queryMock: vi.fn(),
  extractPdfTextMock: vi.fn(),
  parseCallingsPdfTextMock: vi.fn(),
  makeMemberBirthdayKeyMock: vi.fn((name: string, birthday: string) => `${name.toLowerCase()}::${birthday.toLowerCase()}`)
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewCallings: canViewCallingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/imports/pdf', () => ({ extractPdfText: extractPdfTextMock }));
vi.mock('@/src/imports/callings', () => ({
  parseCallingsPdfText: parseCallingsPdfTextMock,
  makeMemberBirthdayKey: makeMemberBirthdayKeyMock
}));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { POST } from './route';

function buildRequest(commit: boolean): Request {
  const formData = new FormData();
  formData.set('commit', commit ? 'true' : 'false');
  formData.set('file', new File([new Uint8Array([1, 2, 3])], 'callings.pdf', { type: 'application/pdf' }));

  return new Request('http://localhost', {
    method: 'POST',
    body: formData
  });
}

describe('POST /api/w/[wardId]/imports/callings', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['CLERK_EDITOR'] }, activeWardId: 'ward-1' });
    canViewCallingsMock.mockReturnValue(true);
    extractPdfTextMock.mockResolvedValue(`
Name  Gender  Age  Birth Date  Organization  Calling  Sustained  Set Apart
John Doe  Male  42  Jan 15  Bishopric  Bishop  Yes  No
`);
    parseCallingsPdfTextMock.mockImplementation((rawText: string) => {
      if (rawText === 'stale import') {
        return [
          {
            memberName: 'Jane Doe',
            birthday: 'Feb 2',
            organization: 'Relief Society',
            callingName: 'Relief Society President',
            sustained: true,
            setApart: true
          }
        ];
      }

      return [
        {
          memberName: 'John Doe',
          birthday: 'Jan 15',
          organization: 'Bishopric',
          callingName: 'Bishop',
          sustained: true,
          setApart: false
        }
      ];
    });

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('returns dry run preview and stale drift metadata', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'import-1', created_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 'member-1', full_name: 'John Doe', birthday: 'Jan 15' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'assign-1', member_name: 'John Doe', birthday: 'Jan 15', calling_name: 'Bishop' }] })
      .mockResolvedValueOnce({ rows: [{ member_name: 'John Doe', birthday: 'Jan 15', calling_name: 'Bishop' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'import-older',
            raw_text: 'stale import'
          }
        ]
      })
      .mockResolvedValueOnce({});

    const response = await POST(buildRequest(false), { params: Promise.resolve({ wardId: 'ward-1' }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      importRunId: 'import-1',
      commit: false,
      parsedCount: 1,
      inserted: 0,
      stale: {
        isStale: true,
        driftCount: 2,
        comparedToImportRunId: 'import-older'
      }
    });
    expect(parseCallingsPdfTextMock).toHaveBeenCalledWith('stale import');
  });

  it('commits and replaces existing calling assignments', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'import-2', created_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 'member-1', full_name: 'John Doe', birthday: 'Jan 15' }] })
      .mockResolvedValueOnce({ rowCount: 2, rows: [{}, {}] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ member_name: 'John Doe', birthday: 'Jan 15', calling_name: 'Bishop' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const response = await POST(buildRequest(true), { params: Promise.resolve({ wardId: 'ward-1' }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      importRunId: 'import-2',
      commit: true,
      parsedCount: 1,
      inserted: 1,
      replacedCount: 2,
      matchedMembers: 1,
      unmatchedMembers: 0
    });

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM calling_assignment'), ['ward-1']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO calling_assignment'), [
      'ward-1',
      'member-1',
      'John Doe',
      'Jan 15',
      'Bishopric',
      'Bishop',
      true,
      false
    ]);
  });
});
