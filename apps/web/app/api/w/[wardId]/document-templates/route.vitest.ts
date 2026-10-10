import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, queryMock, releaseMock, setDbContextMock, canViewMock, canManageMeetingsMock, canManageMock, canManageStakeTemplatesMock, canUseAdvancedMock, auditMock, moduleEnabledMock, moduleEnabledInTransactionMock } = vi.hoisted(() => ({
  authMock: vi.fn(), connectMock: vi.fn(), queryMock: vi.fn(), releaseMock: vi.fn(), setDbContextMock: vi.fn(), canViewMock: vi.fn(), canManageMeetingsMock: vi.fn(), canManageMock: vi.fn(), canManageStakeTemplatesMock: vi.fn(), canUseAdvancedMock: vi.fn(), auditMock: vi.fn(), moduleEnabledMock: vi.fn(), moduleEnabledInTransactionMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewProgramDesigner: canViewMock, canManageMeetings: canManageMeetingsMock, canManageWardProgramTemplates: canManageMock, canManageStakeTemplates: canManageStakeTemplatesMock, canUseAdvancedProgramDesigner: canUseAdvancedMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: auditMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock, isWardModuleEnabledInTransaction: moduleEnabledInTransactionMock }));

import { GET, POST } from './route';
import { normalizeToAdvanced } from '@/src/document-designer/advanced-schema';
import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';

describe('document template collection routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockReset();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-1' });
    canViewMock.mockReturnValue(true);
    canManageMeetingsMock.mockReturnValue(false);
    canManageMock.mockReturnValue(true);
    canManageStakeTemplatesMock.mockReturnValue(false);
    canUseAdvancedMock.mockReturnValue(false);
    moduleEnabledMock.mockResolvedValue(true);
    moduleEnabledInTransactionMock.mockResolvedValue(true);
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

  it('lists the owner\'s personal draft with its latest draft version', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'personal-1', template_key: null, scope_type: 'PERSONAL_DRAFT', scope_id: 'ward-1', document_type: 'SACRAMENT_PROGRAM', name: 'My Draft', description: null, status: 'DRAFT', current_published_version_id: null, created_by_user_id: 'user-1', version_id: 'personal-version-1', version: 1, schema_version: 1, layout_json: {}, theme_json: {}, lock_json: {} }] })
      .mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.templates.some((template: { id: string; scopeType: string; status: string }) => template.id === 'personal-1' && template.scopeType === 'PERSONAL_DRAFT' && template.status === 'DRAFT')).toBe(true);
  });
  it('rejects pure matching-stake admins from creating personal drafts with stable FORBIDDEN', async () => {
    authMock.mockResolvedValue({ user: { id: 'stake-user', roles: [] }, activeWardId: 'ward-1', activeStakeId: 'stake-1' });
    canViewMock.mockReturnValue(false);
    canManageMock.mockReturnValue(false);
    canManageStakeTemplatesMock.mockReturnValue(true);
    queryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ allow_program_editor_create_templates: false, allow_program_editor_publish: false, allow_program_editor_republish: false, allow_program_editor_rollback: false, allow_advanced_program_designer: false }] })
      .mockResolvedValueOnce({});
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Private Draft', scopeType: 'PERSONAL_DRAFT', layout }) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
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
    canUseAdvancedMock.mockReturnValue(true);
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Ward Custom', scopeType: 'WARD', layout }) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(201);
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'PROGRAM_TEMPLATE_CREATED' }));
  });

  it('rejects a SIMPLE-only schema-v2 structural template for a non-Advanced editor', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ allow_program_editor_create_templates: true, allow_program_editor_publish: false, allow_program_editor_republish: false, allow_program_editor_rollback: false, allow_advanced_program_designer: false }] });
    const layout = normalizeToAdvanced(adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' }));
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Structural', scopeType: 'WARD', layout }) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('ADVANCED_BLOCK_READ_ONLY');
  });

  it('returns a stable error when creating a template fails', async () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    queryMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce({});
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Ward Custom', scopeType: 'WARD', layout }) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
  });
});
