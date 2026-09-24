import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, queryMock, releaseMock, setDbContextMock, canViewMock, canManageMock, auditMock, moduleEnabledMock } = vi.hoisted(() => ({
  authMock: vi.fn(), connectMock: vi.fn(), queryMock: vi.fn(), releaseMock: vi.fn(), setDbContextMock: vi.fn(), canViewMock: vi.fn(), canManageMock: vi.fn(), auditMock: vi.fn(), moduleEnabledMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewProgramDesigner: canViewMock, canManageWardProgramTemplates: canManageMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: auditMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock }));

import { GET, POST } from './route';
import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';

describe('document template collection routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-1' });
    canViewMock.mockReturnValue(true);
    canManageMock.mockReturnValue(true);
    moduleEnabledMock.mockResolvedValue(true);
    auditMock.mockResolvedValue(undefined);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('lists built-in templates and readable ward templates', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ id: 'template-1', template_key: null, scope_type: 'WARD', scope_id: 'ward-1', document_type: 'SACRAMENT_PROGRAM', name: 'Ward Custom', description: null, status: 'DRAFT', current_published_version_id: null, created_by_user_id: 'user-1' }] }).mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.templates).toHaveLength(9);
    expect(body.templates[0].source).toBe('BUILT_IN');
    expect(body.templates.at(-1).name).toBe('Ward Custom');
  });

  it('returns a stable error when listing templates fails', async () => {
    queryMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
  });

  it('rejects a malformed template before opening the database', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Bad', scopeType: 'WARD', layout: { nope: true } }) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('creates a ward draft with a validated version and audit event', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ allow_program_editor_create_templates: true, allow_program_editor_publish: false, allow_program_editor_republish: false, allow_program_editor_rollback: false, allow_advanced_program_designer: false }] })
      .mockResolvedValueOnce({ rows: [{ id: 'template-1', template_key: null, scope_type: 'WARD', scope_id: 'ward-1', document_type: 'SACRAMENT_PROGRAM', name: 'Ward Custom', description: null, status: 'DRAFT', current_published_version_id: null, created_by_user_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'version-1', version: 1, schema_version: 1, layout_json: {}, theme_json: {}, lock_json: {} }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Ward Custom', scopeType: 'WARD', layout }) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(201);
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'PROGRAM_TEMPLATE_CREATED' }));
  });

  it('returns a stable error when creating a template fails', async () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    queryMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce({});
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Ward Custom', scopeType: 'WARD', layout }) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
  });
});
