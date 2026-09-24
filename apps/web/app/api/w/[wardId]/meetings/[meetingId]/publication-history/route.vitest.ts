import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canView: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  setDbContext: vi.fn(),
  listHistory: vi.fn(),
  getActive: vi.fn(),
  moduleEnabled: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: mocks.auth }));
vi.mock('@/src/auth/roles', () => ({ canViewProgramDesigner: mocks.canView }));
vi.mock('@/src/db/client', () => ({ pool: { connect: mocks.connect } }));
vi.mock('@/src/db/context', () => ({ setDbContext: mocks.setDbContext }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: mocks.moduleEnabled }));
vi.mock('@/src/document-designer/publication-history', () => ({
  listPublicationHistory: mocks.listHistory,
  getActivePublication: mocks.getActive
}));

import { GET } from './route';

type Params = { wardId: string; meetingId: string };
const params: Params = { wardId: 'ward-1', meetingId: 'meeting-1' };

const history = [
  {
    id: 'render-2', wardId: 'ward-1', meetingId: 'meeting-1', version: 2,
    documentType: 'SACRAMENT_PROGRAM', sourceTemplateId: 'template-1', sourceTemplateVersion: 3,
    publishedByUserId: 'user-1', publishedAt: '2026-01-04T10:00:00.000Z', createdAt: '2026-01-04T10:00:01.000Z',
    active: true, expiresAt: '2026-02-03T10:00:00.000Z', expired: false, activeButExpired: false
  },
  {
    id: 'render-1', wardId: 'ward-1', meetingId: 'meeting-1', version: 1,
    documentType: 'SACRAMENT_PROGRAM', sourceTemplateId: null, sourceTemplateVersion: null,
    publishedByUserId: 'user-1', publishedAt: '2025-12-01T10:00:00.000Z', createdAt: '2025-12-01T10:00:01.000Z',
    active: false, expiresAt: '2025-12-31T10:00:00.000Z', expired: true, activeButExpired: false
  },
  {
    id: 'render-expired-active', wardId: 'ward-1', meetingId: 'meeting-1', version: 3,
    documentType: 'SACRAMENT_PROGRAM', sourceTemplateId: null, sourceTemplateVersion: null,
    publishedByUserId: 'user-1', publishedAt: '2025-01-01T10:00:00.000Z', createdAt: '2025-01-01T10:00:01.000Z',
    active: true, expiresAt: '2025-01-31T10:00:00.000Z', expired: true, activeButExpired: true
  }
];
const active = history[0];

function installQueries(): void {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
    if (sql.includes('SELECT id FROM meeting')) return { rows: [{ id: 'meeting-1' }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe('GET publication history route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-1' });
    mocks.canView.mockReturnValue(true);
    mocks.moduleEnabled.mockResolvedValue(true);
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.listHistory.mockResolvedValue(history);
    mocks.getActive.mockResolvedValue(active);
    installQueries();
  });

  it('rejects unauthenticated requests before database access', async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve(params) });
    expect(response.status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each([
    ['a different active ward', { user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-2' }],
    ['a role without program-designer capability', { user: { id: 'user-1', roles: ['CONDUCTOR_VIEW'] }, activeWardId: 'ward-1' }]
  ])('rejects %s', async (_label, session) => {
    mocks.auth.mockResolvedValue(session);
    mocks.canView.mockReturnValue(false);
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve(params) });
    expect(response.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('checks the exact ward and meeting in the existence query', async () => {
    await GET(new Request('http://localhost'), { params: Promise.resolve(params) });
    expect(mocks.query).toHaveBeenCalledWith(
      'SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
      ['meeting-1', 'ward-1']
    );
    expect(mocks.setDbContext).toHaveBeenCalledWith(expect.anything(), { userId: 'user-1', wardId: 'ward-1' });
    expect(mocks.listHistory).toHaveBeenCalledWith(expect.anything(), params);
    expect(mocks.getActive).toHaveBeenCalledWith(expect.anything(), params);
  });

  it('returns only the safe history DTO and preserves active/expired distinctions', async () => {
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve(params) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ active, history });
    for (const item of body.history) {
      expect(item).not.toHaveProperty('layoutJson');
      expect(item).not.toHaveProperty('renderDataJson');
      expect(item).not.toHaveProperty('privateNotes');
      expect(item).not.toHaveProperty('layout_json');
      expect(item).not.toHaveProperty('render_data_json');
    }
    expect(history[1]).toMatchObject({ active: false, expired: true, activeButExpired: false });
    expect(history[2]).toMatchObject({ active: true, expired: true, activeButExpired: true });
  });
});
