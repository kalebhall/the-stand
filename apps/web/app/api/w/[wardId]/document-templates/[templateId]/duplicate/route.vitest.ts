import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  connectMock,
  queryMock,
  releaseMock,
  setDbContextMock,
  canViewMock,
  canManageMock,
  canUseAdvancedMock,
  moduleEnabledMock,
  moduleEnabledInTransactionMock,
  profileMock,
  auditMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  setDbContextMock: vi.fn(),
  canViewMock: vi.fn(),
  canManageMock: vi.fn(),
  canUseAdvancedMock: vi.fn(),
  moduleEnabledMock: vi.fn(),
  moduleEnabledInTransactionMock: vi.fn(),
  profileMock: vi.fn(),
  auditMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({
  canViewProgramDesigner: canViewMock,
  canManageWardProgramTemplates: canManageMock,
  canUseAdvancedProgramDesigner: canUseAdvancedMock
}));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/modules/service', () => ({
  isWardModuleEnabled: moduleEnabledMock,
  isWardModuleEnabledInTransaction: moduleEnabledInTransactionMock
}));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: auditMock }));
vi.mock('@/src/features/advanced-designer', () => ({ isAdvancedDesignerFeatureEnabled: () => true }));
vi.mock('@/src/document-designer/template-service', async () => {
  const actual = await vi.importActual<typeof import('@/src/document-designer/template-service')>('@/src/document-designer/template-service');
  return { ...actual, loadProgramPermissionProfile: profileMock };
});

import { POST } from './route';
import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';

const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });

function publishedSystemSource() {
  return {
    id: 'system-template-1',
    name: 'System Template',
    description: 'System description',
    status: 'PUBLISHED',
    distribution_policy: 'DUPLICATE_AND_CUSTOMIZE',
    version: 4,
    layout_json: layout
  };
}

describe('published SYSTEM template duplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockReset();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-1' });
    canViewMock.mockReturnValue(true);
    canManageMock.mockReturnValue(true);
    canUseAdvancedMock.mockReturnValue(true);
    moduleEnabledMock.mockResolvedValue(true);
    moduleEnabledInTransactionMock.mockResolvedValue(true);
    profileMock.mockResolvedValue({ allowAdvancedProgramDesigner: true });
    auditMock.mockResolvedValue(undefined);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('duplicates a published persisted SYSTEM template into a ward draft', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [publishedSystemSource()] })
      .mockResolvedValueOnce({ rows: [{ id: 'ward-copy', name: 'Copy', description: 'System description', distribution_policy: 'DUPLICATE_AND_CUSTOMIZE', source_template_id: 'system-template-1', source_template_version: 4, status: 'DRAFT' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'copy-version', version: 1, schema_version: 1, layout_json: layout, theme_json: {}, lock_json: {} }] })
      .mockResolvedValueOnce({});

    const response = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Copy' }) }),
      { params: Promise.resolve({ wardId: 'ward-1', templateId: 'system-template-1' }) }
    );

    expect(response.status).toBe(201);
    expect((await response.json()).template.sourceTemplateId).toBe('system-template-1');
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("t.scope_type = 'SYSTEM'"))).toBe(true);
  });
});
