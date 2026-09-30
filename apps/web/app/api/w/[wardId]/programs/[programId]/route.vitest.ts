import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewMock, moduleMock, connectMock, queryMock, releaseMock, setDbContextMock, loadMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewMock: vi.fn(),
  moduleMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  setDbContextMock: vi.fn(),
  loadMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewProgramDesigner: canViewMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/programs/persistence', () => ({ loadProgramDocument: loadMock }));

import { GET } from './route';

describe('GET /api/w/[wardId]/programs/[programId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-1' });
    canViewMock.mockReturnValue(true);
    moduleMock.mockResolvedValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('returns a ward-scoped generic program document', async () => {
    const program = { id: 'stand-meeting-program:meeting-1', programType: 'SACRAMENT_PROGRAM' };
    loadMock.mockResolvedValue(program);
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1', programId: 'meeting-1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ program });
    expect(loadMock).toHaveBeenCalledWith(expect.anything(), { wardId: 'ward-1', meetingId: 'meeting-1' });
  });

  it('denies access when Programs is disabled', async () => {
    moduleMock.mockResolvedValue(false);
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1', programId: 'meeting-1' }) });
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
