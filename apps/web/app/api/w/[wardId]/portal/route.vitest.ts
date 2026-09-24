import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, setDbContextMock, moduleEnabledMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  setDbContextMock: vi.fn(),
  moduleEnabledMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock }));

import { DELETE, GET, POST } from './route';

const session = {
  user: { id: 'user-1', roles: ['STAND_ADMIN'] },
  activeWardId: 'ward-1'
};
const context = { params: Promise.resolve({ wardId: 'ward-1' }) };

describe('portal route module boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(session);
    moduleEnabledMock.mockResolvedValue(false);
  });

  it.each([
    ['GET', GET, () => new Request('http://localhost')],
    ['POST', POST, () => new Request('http://localhost', { method: 'POST' })],
    ['DELETE', DELETE, () => new Request('http://localhost', { method: 'DELETE' })]
  ] as const)('denies %s before pool access when Programs is disabled', async (_, handler, request) => {
    const response = await handler(request(), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });
    expect(moduleEnabledMock).toHaveBeenCalledWith('ward-1', 'user-1', 'programs');
    expect(connectMock).not.toHaveBeenCalled();
  });
});
