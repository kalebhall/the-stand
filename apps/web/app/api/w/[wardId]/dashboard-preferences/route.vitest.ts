import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() => vi.fn());
const setDbContextMock = vi.hoisted(() => vi.fn());

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/platform/db/context', () => ({ setDbContext: setDbContextMock }));

import { DELETE, GET, PATCH } from './route';

const session = { user: { id: 'user-1', roles: ['BISHOPRIC_EDITOR'] }, activeWardId: 'ward-1' };

function clientMock(rows: unknown[] = []) {
  return {
    query: vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT card_order')) return { rows };
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn()
  };
}

beforeEach(() => {
  authMock.mockReset();
  connectMock.mockReset();
  setDbContextMock.mockReset();
});

describe('dashboard preferences route', () => {
  it('rejects unauthenticated access', async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1' }) });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('rejects unknown card IDs before writing', async () => {
    authMock.mockResolvedValueOnce(session);

    const response = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ cardOrder: ['not-a-card'] }) }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns the saved order and scopes the database context', async () => {
    authMock.mockResolvedValueOnce(session);
    const client = clientMock([{ card_order: ['draft-count', 'next-meeting'] }]);
    connectMock.mockResolvedValueOnce(client);

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1' }) });

    expect(response.status).toBe(200);
    expect((await response.json()).cardOrder.slice(0, 2)).toEqual(['draft-count', 'next-meeting']);
    expect(setDbContextMock).toHaveBeenCalledWith(client, { wardId: 'ward-1', userId: 'user-1' });
    expect(client.release).toHaveBeenCalled();
  });

  it('upserts a valid order', async () => {
    authMock.mockResolvedValueOnce(session);
    const client = clientMock();
    connectMock.mockResolvedValueOnce(client);

    const response = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ cardOrder: ['draft-count', 'next-meeting'] }) }),
      { params: Promise.resolve({ wardId: 'ward-1' }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).cardOrder.slice(0, 2)).toEqual(['draft-count', 'next-meeting']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO dashboard_layout_preference'), expect.any(Array));
  });

  it('resets the preference', async () => {
    authMock.mockResolvedValueOnce(session);
    const client = clientMock();
    connectMock.mockResolvedValueOnce(client);

    const response = await DELETE(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1' }) });

    expect(response.status).toBe(200);
    expect((await response.json()).cardOrder).toHaveLength(17);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM dashboard_layout_preference'), ['ward-1', 'user-1']);
  });
});
