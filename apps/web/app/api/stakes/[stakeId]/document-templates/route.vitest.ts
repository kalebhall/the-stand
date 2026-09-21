import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock } = vi.hoisted(() => ({ authMock: vi.fn(), connectMock: vi.fn() }));
vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));

import { GET } from './route';

const stakeContext = { params: Promise.resolve({ stakeId: 'stake-a' }) };
const assignedSession = {
  user: { id: 'stake-user', roles: [] },
  activeWardId: 'ward-a',
  activeStakeId: 'stake-a',
  stakeAssignments: [{ stakeId: 'stake-a', roleNames: ['STAKE_ADMIN'] }]
};

function setupClient(rows: unknown[] = []) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('SELECT set_config')) return { rows: [] };
      return { rows };
    }),
    release: vi.fn()
  };
  connectMock.mockResolvedValue(client);
  return client;
}

describe('stake document-template route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(assignedSession);
  });

  it('denies a stake administrator assigned to a different stake before connecting', async () => {
    authMock.mockResolvedValue({ ...assignedSession, stakeAssignments: [] });
    const response = await GET(new Request('http://localhost'), stakeContext);
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('lists only the requested stake scope inside a transaction', async () => {
    const client = setupClient([{ id: 'template-a', scope_type: 'STAKE', scope_id: 'stake-a', status: 'PUBLISHED', name: 'Stake' }]);
    const response = await GET(new Request('http://localhost'), stakeContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ templates: [{ id: 'template-a', scopeType: 'STAKE' }] });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("scope_type = 'STAKE' AND scope_id = $1::uuid"), ['stake-a']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('does not let SUPPORT_ADMIN impersonate a stake assignment', async () => {
    authMock.mockResolvedValue({ user: { id: 'support-user', roles: ['SUPPORT_ADMIN'] }, activeWardId: null, activeStakeId: null });
    const response = await GET(new Request('http://localhost'), stakeContext);
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
