import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, queryMock, releaseMock, setDbContextMock, auditMock } = vi.hoisted(() => ({
  authMock: vi.fn(), connectMock: vi.fn(), queryMock: vi.fn(), releaseMock: vi.fn(), setDbContextMock: vi.fn(), auditMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewProgramDesigner: vi.fn(() => true), canEditProgramDesign: vi.fn(() => true), canUseAdvancedProgramDesigner: vi.fn(() => false) }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: auditMock }));

import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';
import { GET, POST, PUT } from './route';

const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const documentRow = { id: 'document-1', source_template_id: 'template-1', source_template_version: 2, schema_version: 1, layout_json: layout, theme_json: layout.theme, revision: 3, source_template_name: 'Ward Template' };

function params() { return { params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' }) }; }

describe('program design route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockReset();
    connectMock.mockReset();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'], name: 'Editor' }, activeWardId: 'ward-1' });
    auditMock.mockResolvedValue(undefined);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('returns a ward-scoped document and safe preview source', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', meeting_date: '2026-09-20', meeting_type: 'SACRAMENT', ward_name: 'Freedom Park Ward' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ item_type: 'SPEAKER', title: 'Alex Hall', topic: 'Faith', hymn_title: null, sequence: 2 }] })
      .mockResolvedValueOnce({ rows: [{ allow_advanced_program_designer: false }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.revision).toBe(3);
    expect(body.document.sourceTemplateVersion).toBe(2);
    expect(body.previewSource.programItems[0]).toEqual({ order: 2, label: 'Alex Hall', details: 'Faith' });
  });

  it('saves only with the expected revision and increments it without publishing', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ allow_advanced_program_designer: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', revision: 4 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ expectedRevision: 3, document: layout }) }), params());
    expect(response.status).toBe(200);
    expect((await response.json()).revision).toBe(4);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE meeting_document'), expect.arrayContaining([3]));
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('meeting_program_render'), expect.anything());
  });

  it('returns a conflict and retains local state on a stale revision', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ allow_advanced_program_designer: false }] })
      .mockResolvedValueOnce({});
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ expectedRevision: 2, document: layout }) }), params());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('REVISION_CONFLICT');
  });

  it('returns stable database errors for reads', async () => {
    queryMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), params());
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
  });

  it('validates a draft without publishing it', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', meeting_date: '2026-09-20', meeting_type: 'SACRAMENT', ward_name: 'Freedom Park Ward' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ document: layout }) }), params());
    expect(response.status).toBe(200);
    expect((await response.json()).publicSafe).toBe(true);
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
  });
});
