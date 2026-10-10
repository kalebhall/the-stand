import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, queryMock, releaseMock, setDbContextMock, canViewMock, canUseAdvancedMock, moduleEnabledMock, moduleEnabledInTransactionMock, featureEnabledMock, loadProfileMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  setDbContextMock: vi.fn(),
  canViewMock: vi.fn(),
  canUseAdvancedMock: vi.fn(),
  moduleEnabledMock: vi.fn(),
  moduleEnabledInTransactionMock: vi.fn(),
  featureEnabledMock: vi.fn(),
  loadProfileMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', async () => {
  const actual = await vi.importActual<typeof import('@/src/auth/roles')>('@/src/auth/roles');
  return { ...actual, canViewProgramDesigner: canViewMock, canUseAdvancedProgramDesigner: canUseAdvancedMock };
});
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/platform/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock, isWardModuleEnabledInTransaction: moduleEnabledInTransactionMock }));
vi.mock('@/src/features/advanced-designer', () => ({ isAdvancedDesignerFeatureEnabled: featureEnabledMock }));
vi.mock('@/src/document-designer/template-service', async () => {
  const actual = await vi.importActual<typeof import('@/src/document-designer/template-service')>('@/src/document-designer/template-service');
  return { ...actual, loadProgramPermissionProfile: loadProfileMock };
});

import { POST } from './route';

const wardId = '11111111-1111-4111-8111-111111111111';

function advancedSnapshot() {
  return {
    version: 1,
    blockType: 'IMAGE',
    config: { assetId: null, alt: '', isDecorative: true },
    width: 'FULL',
    visibility: 'VISIBLE',
    printBehavior: 'PRINT_AND_DIGITAL',
    digitalBehavior: 'NORMAL'
  };
}

describe('reusable block collection advanced boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: '22222222-2222-4222-8222-222222222222', roles: ['PROGRAM_EDITOR'] }, activeWardId: wardId });
    canViewMock.mockReturnValue(true);
    canUseAdvancedMock.mockReturnValue(false);
    moduleEnabledMock.mockResolvedValue(true);
    moduleEnabledInTransactionMock.mockResolvedValue(true);
    featureEnabledMock.mockReturnValue(true);
    loadProfileMock.mockResolvedValue({ allowAdvancedProgramDesigner: false });
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('rejects creation of an advanced reusable snapshot for a non-Advanced editor', async () => {
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ scope: 'WARD', name: 'Image', snapshot: advancedSnapshot() })
      }),
      { params: Promise.resolve({ wardId }) }
    );

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('ADVANCED_BLOCK_READ_ONLY');
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO reusable_block'))).toBe(false);
  });
});
