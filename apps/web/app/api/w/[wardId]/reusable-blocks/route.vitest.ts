import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, queryMock, releaseMock, setDbContextMock, canViewMock, moduleEnabledMock, moduleEnabledInTransactionMock, featureEnabledMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  setDbContextMock: vi.fn(),
  canViewMock: vi.fn(),

  moduleEnabledMock: vi.fn(),
  moduleEnabledInTransactionMock: vi.fn(),
  featureEnabledMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', async () => {
  const actual = await vi.importActual<typeof import('@/src/auth/roles')>('@/src/auth/roles');
  return { ...actual, canViewProgramDesigner: canViewMock };
});
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/platform/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock, isWardModuleEnabledInTransaction: moduleEnabledInTransactionMock }));
vi.mock('@/src/features/advanced-designer', () => ({ isAdvancedDesignerFeatureEnabled: featureEnabledMock }));


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

    moduleEnabledMock.mockResolvedValue(true);
    moduleEnabledInTransactionMock.mockResolvedValue(true);
    featureEnabledMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT stake_id FROM ward')) return { rows: [{ stake_id: '44444444-4444-4444-8444-444444444444' }] };
      if (sql.includes('INSERT INTO reusable_block (')) return { rows: [{ id: '55555555-5555-4555-8555-555555555555' }] };
      return { rows: [] };
    });
  });

  it('allows an authorized Program Editor to create an advanced reusable snapshot', async () => {
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ scope: 'WARD', name: 'Image', snapshot: advancedSnapshot() })
      }),
      { params: Promise.resolve({ wardId }) }
    );

    expect(response.status).toBe(201);
    expect((await response.json()).block.version).toBe(1);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO reusable_block'))).toBe(true);
  });
});
