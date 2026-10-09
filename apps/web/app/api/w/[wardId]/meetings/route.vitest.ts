import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageMeetingsMock, setDbContextMock, connectMock, releaseMock, queryMock, dispatchPersistedCoreEventMock, isWardModuleEnabledInTransactionMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    canManageMeetingsMock: vi.fn(),
    setDbContextMock: vi.fn(),
    connectMock: vi.fn(),
    releaseMock: vi.fn(),
    queryMock: vi.fn(),
    dispatchPersistedCoreEventMock: vi.fn(),
    isWardModuleEnabledInTransactionMock: vi.fn()
  }));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock, canViewMeetings: vi.fn() }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabledInTransaction: isWardModuleEnabledInTransactionMock }));
vi.mock('@/src/platform/events/dispatch', () => ({ dispatchPersistedCoreEvent: dispatchPersistedCoreEventMock }));

import { POST } from './route';

describe('POST /api/w/[wardId]/meetings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canManageMeetingsMock.mockReturnValue(true);
    isWardModuleEnabledInTransactionMock.mockResolvedValue(true);
    dispatchPersistedCoreEventMock.mockResolvedValue(undefined);
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
            {
              itemType: 'INTRODUCTION',
              title: '',
              notes: '',
              introductionRoles: { presiding: 'Bishop', conducting: 'Counselor', organist: 'Organist', chorister: 'Chorister' },
              hymnNumber: '',
              hymnTitle: ''
            },
            { itemType: 'ANNOUNCEMENT', title: '', notes: '', hymnNumber: '', hymnTitle: '' },
            { itemType: 'OPENING_HYMN', title: '', notes: '', hymnNumber: '2', hymnTitle: 'The Spirit of God', hymnLocale: 'es' },
            { itemType: 'SPEAKER', title: 'Jane Doe', notes: '', topic: 'Missionary report', hymnNumber: '', hymnTitle: '' }
          ]
        })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'meeting-1' });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO meeting_program_item'),
      expect.arrayContaining(['ward-1', 'meeting-1', 3, 'OPENING_HYMN'])
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('hymn_locale'),
      expect.arrayContaining(['ward-1', 'meeting-1', 3, 'OPENING_HYMN', 'es'])
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO meeting_program_item'),
      expect.arrayContaining(['ward-1', 'meeting-1', 4, 'SPEAKER'])
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_log'),
      expect.arrayContaining(['ward-1', 'user-1', 'MEETING_CREATED'])
    );
    expect(releaseMock).toHaveBeenCalled();
  });

  it('uses the ward built-in default template when creating a meeting', async () => {
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ default_sacrament_template_key: 'classic-bifold', default_sacrament_template_id: null }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'core-event-1' }] })
      .mockResolvedValueOnce({});
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meetingDate: '2026-01-04',
          meetingType: 'SACRAMENT',
          programItems: [
            {
              itemType: 'INTRODUCTION',
              title: '',
              notes: '',
              introductionRoles: { presiding: 'Bishop', conducting: 'Counselor', organist: 'Organist', chorister: 'Chorister' },
              hymnNumber: '',
              hymnTitle: ''
            },
            { itemType: 'ANNOUNCEMENT', title: '', notes: '', hymnNumber: '', hymnTitle: '' },
            { itemType: 'OPENING_HYMN', title: '', notes: '', hymnNumber: '2', hymnTitle: 'The Spirit of God', hymnLocale: 'en-US' },
            { itemType: 'SPEAKER', title: 'Jane Doe', notes: '', topic: 'Missionary report', hymnNumber: '', hymnTitle: '' }
          ]
        })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );
    expect(response.status).toBe(201);
    const insertCall = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO meeting_document'));
    expect(insertCall).toBeDefined();
    const insertValues = insertCall?.[1] as unknown[];
    const persistedLayout = JSON.parse(String(insertValues[5])) as { fold?: string; pages?: Array<{ regions?: unknown[] }> };
    expect(persistedLayout.fold).toBe('BIFOLD');
    expect(persistedLayout.pages?.[0]?.regions).toHaveLength(4);
  });

  it('does not apply persisted templates when Programs is disabled', async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    isWardModuleEnabledInTransactionMock.mockResolvedValue(false);
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-disabled-programs' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'event-disabled' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'core-disabled' }] })
      .mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetingDate: '2026-01-04', meetingType: 'SACRAMENT', programItems: [
   { itemType: 'INTRODUCTION', title: '', notes: '', introductionRoles: { presiding: 'Bishop', conducting: 'Counselor', organist: 'Organist', chorister: 'Chorister' }, hymnNumber: '', hymnTitle: '' },
   { itemType: 'ANNOUNCEMENT', title: '', notes: '', hymnNumber: '', hymnTitle: '' },
   { itemType: 'OPENING_HYMN', title: '', notes: '', hymnNumber: '2', hymnTitle: 'The Spirit of God' },
   { itemType: 'SPEAKER', title: 'Jane Doe', notes: '', topic: 'Missionary report', hymnNumber: '', hymnTitle: '' }
 ] })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(201);
    expect(queryMock).not.toHaveBeenCalledWith(
      expect.stringContaining('default_sacrament_template_id'),
      expect.anything()
    );
    const documentInsert = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO meeting_document'));
    expect(documentInsert?.[1]).toEqual(expect.arrayContaining([null, null]));
  });

  it('rejects unsupported source-row types before opening a transaction', async () => {
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meetingDate: '2026-01-04',
          meetingType: 'SACRAMENT',
          programItems: [{ itemType: 'UNKNOWN_ITEM', title: '', notes: '', hymnNumber: '', hymnTitle: '' }]
        })
      }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Unsupported program item type', code: 'BAD_REQUEST' });
    expect(connectMock).not.toHaveBeenCalled();
  });
});
