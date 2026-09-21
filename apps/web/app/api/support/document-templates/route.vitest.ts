import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock } = vi.hoisted(() => ({ authMock: vi.fn(), connectMock: vi.fn() }));
vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));

import { GET } from './route';

const supportSession = { user: { id: 'support-user', roles: ['SUPPORT_ADMIN'] }, activeWardId: null, activeStakeId: null };

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

describe('support document-template route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(supportSession);
  });

  it('denies unauthenticated system-template access before connecting', async () => {
    authMock.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('allows SUPPORT_ADMIN to list system templates in a transaction', async () => {
    const client = setupClient([{ id: 'template-a', scope_type: 'SYSTEM', status: 'DRAFT', name: 'System' }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ templates: [{ id: 'template-a', scopeType: 'SYSTEM' }] });
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('does not treat a ward role as system-template administration', async () => {
    authMock.mockResolvedValue({ user: { id: 'ward-user', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-a' });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
