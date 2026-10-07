import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canView: vi.fn(),
  canManage: vi.fn(),
  canUseInternalNotes: vi.fn(),
  setDbContext: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: mocks.auth }));
vi.mock('@/src/auth/roles', () => ({
  canViewMeetings: mocks.canView,
  canManageMeetings: mocks.canManage,
  canUseInternalNotes: mocks.canUseInternalNotes
}));
vi.mock('@/src/db/context', () => ({ setDbContext: mocks.setDbContext }));
vi.mock('@/src/db/client', () => ({ pool: { connect: mocks.connect } }));
vi.mock('@/src/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));

import { computeProgramItemsRevision } from '@/src/meetings/program-item-source';

import { GET, PUT } from './route';

const params = { params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' }) };

const existingItems = [
  {
    id: 'item-1',
    item_type: 'INTRODUCTION',
    title: null,
    notes: null,
    topic: null,
    program_notes: null,
    hymn_number: null,
    hymn_title: null,
    hymn_locale: 'en-US',
    introduction_roles: null,
    speaker_status: null,
    sequence: 1
  },
  {
    id: 'item-2',
    item_type: 'ANNOUNCEMENT',
    title: null,
    notes: null,
    topic: null,
    program_notes: null,
    hymn_number: null,
    hymn_title: null,
    hymn_locale: 'en-US',
    introduction_roles: null,
    speaker_status: null,
    sequence: 2
  }
];

function installMeetingQuery(): void {
  mocks.query
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'meeting-1', meeting_date: '2026-10-04', meeting_type: 'SACRAMENT', status: 'DRAFT' }]
    })
    .mockResolvedValueOnce({
      rows: [
        {
          id: 'item-1',
          item_type: 'INTRODUCTION',
          title: 'Introduction',
          notes: 'Bishopric private note',
          topic: null,
          program_notes: 'Welcome',
          hymn_number: null,
          hymn_title: null,
          hymn_locale: 'en-US',
          introduction_roles: {
            presiding: 'Bishop Hall',
            conducting: 'Sister Hall',
            organist: 'Brother Organist',
            chorister: 'Sister Chorister'
          },
          speaker_status: null,
          sequence: 1
        }
      ]
    })
    .mockResolvedValueOnce({});
}

describe('GET /api/w/[wardId]/meetings/[meetingId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user-1', roles: ['CONDUCTOR_VIEW'] }, activeWardId: 'ward-1' });
    mocks.canView.mockReturnValue(true);
    mocks.canManage.mockReturnValue(true);
    mocks.canUseInternalNotes.mockReturnValue(false);
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  });

  it('omits internal notes for a conductor-only viewer', async () => {
    installMeetingQuery();
    const response = await GET(new Request('http://localhost'), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meeting.programItems[0]).not.toHaveProperty('notes');
    expect(body.meeting.programItems[0].programNotes).toBe('Welcome');
  });

  it('includes internal notes only for an authorized internal-notes user', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-1', roles: ['BISHOPRIC_EDITOR'] }, activeWardId: 'ward-1' });
    mocks.canUseInternalNotes.mockReturnValue(true);
    installMeetingQuery();
    const response = await GET(new Request('http://localhost'), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meeting.programItems[0].notes).toBe('Bishopric private note');
  });

  it('rejects duplicate and foreign source-row IDs before mutation', async () => {
    const expectedProgramItemsRevision = computeProgramItemsRevision(existingItems, { includeInternalNotes: false });
    for (const programItems of [
      [
        { id: 'item-1', itemType: 'INTRODUCTION', title: '', notes: '', hymnNumber: '', hymnTitle: '' },
        { id: 'item-1', itemType: 'INTRODUCTION', title: '', notes: '', hymnNumber: '', hymnTitle: '' }
      ],
      [{ id: 'foreign-item', itemType: 'ANNOUNCEMENT', title: '', notes: '', hymnNumber: '', hymnTitle: '' }]
    ]) {
      mocks.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ meeting_date: '2026-10-04', meeting_type: 'SACRAMENT' }] })
        .mockResolvedValueOnce({ rows: existingItems });
      const response = await PUT(
        new Request('http://localhost', {
          method: 'PUT',
          body: JSON.stringify({ expectedProgramItemsRevision, programItems })
        }),
        params
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(expect.objectContaining({ code: 'BAD_REQUEST' }));
      expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
      mocks.query.mockReset();
    }
  });

  it('rejects unsupported new source-row types', async () => {
    const expectedProgramItemsRevision = computeProgramItemsRevision(existingItems, { includeInternalNotes: false });
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ meeting_date: '2026-10-04', meeting_type: 'SACRAMENT' }] })
      .mockResolvedValueOnce({ rows: existingItems });
    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({
          expectedProgramItemsRevision,
          programItems: [{ itemType: 'UNKNOWN_SOURCE_ROW', title: '', notes: '', hymnNumber: '', hymnTitle: '' }]
        })
      }),
      params
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('BAD_REQUEST');
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
