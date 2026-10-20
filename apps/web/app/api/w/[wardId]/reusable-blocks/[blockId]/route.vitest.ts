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


import { PATCH } from './route';

const wardId = '11111111-1111-4111-8111-111111111111';
const blockId = '33333333-3333-4333-8333-333333333333';

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

describe('reusable block item advanced boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: '22222222-2222-4222-8222-222222222222', roles: ['PROGRAM_EDITOR'] }, activeWardId: wardId });
    canViewMock.mockReturnValue(true);

    moduleEnabledMock.mockResolvedValue(true);
    moduleEnabledInTransactionMock.mockResolvedValue(true);
    featureEnabledMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM reusable_block b')) return { rows: [{ id: blockId, current_version: 1, block_type: 'IMAGE', status: 'ACTIVE' }] };
      if (sql.includes('INSERT INTO reusable_block_version')) return { rows: [] };
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      return { rows: [], rowCount: 1 };
    });
  });

  it('allows an authorized Program Editor to update an advanced reusable snapshot', async () => {
    const response = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ snapshot: advancedSnapshot() })
      }),
      { params: Promise.resolve({ wardId, blockId }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).version).toBe(2);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO reusable_block_version'))).toBe(true);
  });
});
