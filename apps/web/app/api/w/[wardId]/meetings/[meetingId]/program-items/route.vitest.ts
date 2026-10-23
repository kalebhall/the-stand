import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  canEditMock,
  canEditItemPatchMock,
  connectMock,
  queryMock,
  releaseMock,
  setDbContextMock,
  auditMock,
  moduleEnabledMock,
  moduleEnabledInTxMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  canEditMock: vi.fn(() => true),
  canEditItemPatchMock: vi.fn((_session: unknown, _wardId: string, _patch: { kind: string; field?: string }) => true),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  setDbContextMock: vi.fn(),
  auditMock: vi.fn(),
  moduleEnabledMock: vi.fn(),
  moduleEnabledInTxMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({
  canViewProgramDesigner: vi.fn(() => true),
  canEditProgramDesign: canEditMock,
  canEditProgramItemPatch: canEditItemPatchMock
}));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/modules/service', () => ({
  isWardModuleEnabled: moduleEnabledMock,
  isWardModuleEnabledInTransaction: moduleEnabledInTxMock
}));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: auditMock }));

import { GET } from './route';
import { PATCH } from './[itemId]/route';
import { programItemsResponseSchema } from '@/src/meetings/program-item-contracts';

const meeting = { id: '00000000-0000-0000-0000-000000000010', meeting_date: '2026-09-20', meeting_type: 'SACRAMENT' };
const introduction = {
  id: '00000000-0000-0000-0000-000000000001',
  sequence: 1,
  item_type: 'INTRODUCTION',
  title: 'Introduction',
  notes: 'Private',
  topic: null,
  program_notes: 'Welcome',
  hymn_number: null,
  hymn_title: null,
  hymn_locale: 'en-US',
  introduction_roles: {
    presiding: '',
    conducting: '',
    organist: '',
    chorister: '',
    visitingLeaders: [{ name: 'Private Visitor', calling: 'Stake leader', recognitionType: 'HIGH_COUNCILOR' }]
  },
  speaker_status: null
};
const announcement = {
  ...introduction,
  id: '00000000-0000-0000-0000-000000000002',
  sequence: 2,
  item_type: 'ANNOUNCEMENT',
  title: 'Announcements'
};

function collectionParams() {
  return { params: Promise.resolve({ wardId: 'ward-1', meetingId: meeting.id }) };
}
function itemParams() {
  return { params: Promise.resolve({ wardId: 'ward-1', meetingId: meeting.id, itemId: introduction.id }) };
}
function body(value: unknown) {
  return new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(value) });
}

function mockRead(rows = [introduction, announcement]) {
  queryMock.mockResolvedValueOnce({ rows: [meeting] }).mockResolvedValueOnce({ rows });
}

describe('program items routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockReset();
    connectMock.mockReset();
    canEditMock.mockReturnValue(true);
    canEditItemPatchMock.mockImplementation((_session, _wardId, patch) => patch.kind === 'TEXT' && patch.field === 'programNotes');
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'], name: 'Editor' }, activeWardId: 'ward-1' });
    moduleEnabledMock.mockResolvedValue(true);
    moduleEnabledInTxMock.mockResolvedValue(true);
    auditMock.mockResolvedValue(undefined);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('requires the Programs module before opening a DB connection', async () => {
    moduleEnabledMock.mockResolvedValue(false);
    const response = await GET(new Request('http://localhost'), collectionParams());
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('never returns internal notes or visiting-leader details for a privileged Program Content viewer', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['BISHOPRIC_EDITOR'], name: 'Editor' }, activeWardId: 'ward-1' });
    queryMock.mockResolvedValueOnce({});
    mockRead();
    queryMock.mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), collectionParams());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.sourceRevision).toMatch(/^sr1_[a-f0-9]{64}$/);
    const revisionSource = await import('@/src/meetings/program-item-source');
    expect(payload.sourceRevision).toBe(
      revisionSource.computeProgramItemsRevision([introduction, announcement], { includeInternalNotes: false })
    );
    expect(payload.items[0]).not.toHaveProperty('notes');
    expect(payload.items[0]).not.toHaveProperty('internalNotesEditable');
    expect(payload.items[0].introductionRoles).not.toHaveProperty('visitingLeaders');
    expect(JSON.stringify(payload)).not.toContain('Private Visitor');
    expect(programItemsResponseSchema.safeParse(payload).success).toBe(true);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('NULL::text AS notes'), expect.anything());
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("introduction_roles - 'visitingLeaders'"), expect.anything());
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "CASE WHEN jsonb_typeof(introduction_roles) = 'object' THEN introduction_roles - 'visitingLeaders' ELSE NULL END"
      ),
      expect.anything()
    );
  });

  it('rejects unknown patch keys before opening a DB connection', async () => {
    const response = await PATCH(
      body({ expectedRevision: 'sr1_' + '0'.repeat(64), patch: { kind: 'TEXT', field: 'title', value: 'New', sequence: 3 } }),
      itemParams()
    );
    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('rejects a caller outside the active ward before opening a DB connection', async () => {
    canEditMock.mockReturnValue(false);
    const response = await PATCH(
      body({ expectedRevision: 'sr1_' + '0'.repeat(64), patch: { kind: 'TEXT', field: 'programNotes', value: 'No' } }),
      itemParams()
    );
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('rejects content edits through this endpoint even for users allowed to edit program content', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['BISHOPRIC_EDITOR'], name: 'Editor' }, activeWardId: 'ward-1' });
    canEditItemPatchMock.mockReturnValue(true);
    const response = await PATCH(
      body({ expectedRevision: 'sr1_' + '0'.repeat(64), patch: { kind: 'TEXT', field: 'title', value: 'Changed' } }),
      itemParams()
    );
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('saves program notes when only hidden private fields changed and never returns them', async () => {
    queryMock.mockResolvedValueOnce({});
    const privateChangedIntroduction = {
      ...introduction,
      notes: 'Changed internal note',
      introduction_roles: {
        ...introduction.introduction_roles,
        visitingLeaders: [{ name: 'Changed Private Visitor', calling: 'Changed stake calling', recognitionType: 'HIGH_COUNCILOR' }]
      }
    };
    mockRead([privateChangedIntroduction, announcement]);
    const revisionSource = await import('@/src/meetings/program-item-source');
    const expectedRevision = revisionSource.computeProgramItemsRevision([introduction, announcement], { includeInternalNotes: false });
    const updatedIntroduction = { ...privateChangedIntroduction, program_notes: 'Updated public note' };
    queryMock.mockResolvedValueOnce({});
    queryMock.mockResolvedValueOnce({ rows: [] });
    mockRead([updatedIntroduction, announcement]);
    queryMock.mockResolvedValueOnce({});
    const response = await PATCH(
      body({ expectedRevision, patch: { kind: 'TEXT', field: 'programNotes', value: 'Updated public note' } }),
      itemParams()
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE meeting_program_item'),
      expect.arrayContaining(['Updated public note', introduction.id, meeting.id, 'ward-1'])
    );
    expect(payload.items[0]).not.toHaveProperty('notes');
    expect(payload.items[0]).not.toHaveProperty('internalNotesEditable');
    expect(payload.items[0].introductionRoles).not.toHaveProperty('visitingLeaders');
    expect(JSON.stringify(payload)).not.toContain('Changed Private Visitor');
    expect(payload.items[0].programNotes).toBe('Updated public note');
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('meeting_document'), expect.anything());
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'PROGRAM_ITEM_UPDATED', entityId: introduction.id })
    );
  });

  it('rejects internal-note mutations in the content section even for internal-note-capable callers', async () => {
    const revisionSource = await import('@/src/meetings/program-item-source');
    const response = await PATCH(
      body({
        expectedRevision: revisionSource.computeProgramItemsRevision([introduction, announcement], { includeInternalNotes: false }),
        patch: { kind: 'TEXT', field: 'notes', value: 'No' }
      }),
      itemParams()
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('rejects an Introduction roles patch through the content section', async () => {
    const revisionSource = await import('@/src/meetings/program-item-source');
    const response = await PATCH(
      body({
        expectedRevision: revisionSource.computeProgramItemsRevision([introduction, announcement], { includeInternalNotes: false }),
        patch: { kind: 'INTRODUCTION_ROLES', value: { presiding: 'Bishop Hall', conducting: '', organist: '', chorister: '' } }
      }),
      itemParams()
    );
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('checks the module enablement inside the mutation transaction', async () => {
    moduleEnabledInTxMock.mockResolvedValue(false);
    queryMock.mockResolvedValueOnce({});
    const response = await PATCH(
      body({ expectedRevision: 'sr1_' + '0'.repeat(64), patch: { kind: 'TEXT', field: 'programNotes', value: 'No' } }),
      itemParams()
    );
    expect(response.status).toBe(403);
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
  });

  it('returns current safe rows for a stale writer', async () => {
    queryMock.mockResolvedValueOnce({});
    mockRead();
    queryMock.mockResolvedValueOnce({});
    const response = await PATCH(
      body({ expectedRevision: 'sr1_' + 'f'.repeat(64), patch: { kind: 'TEXT', field: 'programNotes', value: 'New' } }),
      itemParams()
    );
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.code).toBe('REVISION_CONFLICT');
    expect(payload.current.items).toHaveLength(2);
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE meeting_program_item'), expect.anything());
  });

  it('does not allow a Program Designer to mutate managed announcements', async () => {
    const managedItemParams = { params: Promise.resolve({ wardId: 'ward-1', meetingId: meeting.id, itemId: announcement.id }) };
    queryMock.mockResolvedValueOnce({});
    mockRead();
    queryMock.mockResolvedValueOnce({});
    const revisionSource = await import('@/src/meetings/program-item-source');
    const response = await PATCH(
      body({
        expectedRevision: revisionSource.computeProgramItemsRevision([introduction, announcement], { includeInternalNotes: false }),
        patch: { kind: 'TEXT', field: 'programNotes', value: 'No' }
      }),
      managedItemParams
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('SOURCE_MANAGED');
  });

  it('rejects a mutation when the stored protected order is invalid', async () => {
    const invalidRows = [
      { ...announcement, sequence: 1 },
      { ...introduction, sequence: 2 }
    ];
    queryMock.mockResolvedValueOnce({});
    mockRead(invalidRows);
    queryMock.mockResolvedValueOnce({});
    const revisionSource = await import('@/src/meetings/program-item-source');
    const response = await PATCH(
      body({
        expectedRevision: revisionSource.computeProgramItemsRevision(invalidRows, { includeInternalNotes: false }),
        patch: { kind: 'TEXT', field: 'programNotes', value: 'No' }
      }),
      itemParams()
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('INVALID_PROTECTED_ORDER');
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE meeting_program_item'), expect.anything());
  });
});
