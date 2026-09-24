import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewMeetingsMock, connectMock, setDbContextMock, moduleEnabledMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewMeetingsMock: vi.fn(),
  connectMock: vi.fn(),
  setDbContextMock: vi.fn(),
  moduleEnabledMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewMeetings: canViewMeetingsMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock }));

import { GET } from './route';

const context = { params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' }) };
const session = {
  user: { id: 'user-1', roles: ['BISHOPRIC_EDITOR'] },
  activeWardId: 'ward-1'
};

describe('basic meeting render route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(session);
    canViewMeetingsMock.mockReturnValue(true);
    moduleEnabledMock.mockResolvedValue(false);
    connectMock.mockResolvedValue({
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM meeting m')) {
          return { rows: [{ id: 'meeting-1', meeting_date: '2026-01-01', meeting_type: 'SACRAMENT', status: 'PUBLISHED', ward_name: 'Ward 1' }] };
        }
        if (sql.includes('FROM meeting_program_item')) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn()
    });
  });

  it('remains available and returns basic HTML when Programs is disabled', async () => {
    const response = await GET(new Request('http://localhost'), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('data-core-render="basic"');
    expect(moduleEnabledMock).not.toHaveBeenCalled();
  });
});
