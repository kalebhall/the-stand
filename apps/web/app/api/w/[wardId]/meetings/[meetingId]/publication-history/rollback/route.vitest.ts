import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canView: vi.fn(),
  canRollback: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  setDbContext: vi.fn(),
  audit: vi.fn(),
  expiration: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: mocks.auth }));
vi.mock('@/src/auth/roles', () => ({
  canViewProgramDesigner: mocks.canView,
  canRollbackProgram: mocks.canRollback
}));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: mocks.audit }));
vi.mock('@/src/db/client', () => ({ pool: { connect: mocks.connect } }));
vi.mock('@/src/db/context', () => ({ setDbContext: mocks.setDbContext }));
vi.mock('@/src/document-designer/publication-service', () => ({ calculatePublicationExpiration: mocks.expiration }));

import { POST } from './route';

type Params = { wardId: string; meetingId: string };
const params: Params = { wardId: 'ward-1', meetingId: 'meeting-1' };

function request(body: unknown): Request {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
}

type QueryState = { meeting?: boolean; settings?: boolean; share?: boolean; target?: boolean; incomplete?: boolean };

function installQueries(options: QueryState = {}): void {
  const state = { meeting: true, settings: true, share: true, target: true, incomplete: false, ...options };
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
    if (sql.includes('SELECT id, meeting_date FROM meeting')) {
      return state.meeting ? { rows: [{ id: 'meeting-1', meeting_date: '2026-01-04' }] } : { rows: [] };
    }
    if (sql.includes('FROM ward_document_settings')) {
      return state.settings ? { rows: [{ allow_program_editor_rollback: true, public_program_expiration_days: 30 }] } : { rows: [] };
    }
    if (sql.includes('FROM public_program_share')) {
      return state.share ? { rows: [{ token: 'share-token', active_render_id: 'render-2', previous_version: 2 }] } : { rows: [] };
    }
    if (sql.includes('FROM meeting_program_render')) {
      return state.target
        ? { rows: [{ id: 'render-1', version: 1, document_type: 'SACRAMENT_PROGRAM', published_at: '2026-01-01T10:00:00.000Z', layout_json: state.incomplete ? null : { pages: [] }, render_data_json: state.incomplete ? null : { items: [] } }] }
        : { rows: [] };
    }
    if (sql.includes('UPDATE public_program_share')) return {};
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe('POST publication history rollback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user-1', name: 'User', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-1' });
    mocks.canView.mockReturnValue(true);
    mocks.canRollback.mockReturnValue(true);
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.setDbContext.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
    mocks.expiration.mockReturnValue(new Date('2026-01-31T10:00:00.000Z'));
    installQueries();
  });

  it.each([
    ['empty body', new Request('http://localhost', { method: 'POST', body: '' })],
    ['malformed JSON', new Request('http://localhost', { method: 'POST', body: '{' })],
    ['extra fields', request({ version: 1, privateField: true })],
    ['non-positive version', request({ version: 0 })]
  ])('rejects %s before auth and database access', async (_label, input) => {
    const response = await POST(input, { params: Promise.resolve(params) });
    expect(response.status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(request({ version: 1 }), { params: Promise.resolve(params) });
    expect(response.status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each([
    ['a different active ward', { user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-2' }],
    ['a role without view capability', { user: { id: 'user-1', roles: ['CONDUCTOR_VIEW'] }, activeWardId: 'ward-1' }]
  ])('rejects %s', async (_label, session) => {
    mocks.auth.mockResolvedValue(session);
    mocks.canView.mockReturnValue(false);
    const response = await POST(request({ version: 1 }), { params: Promise.resolve(params) });
    expect(response.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('rejects a user without rollback capability', async () => {
    mocks.canRollback.mockReturnValue(false);
    const response = await POST(request({ version: 1 }), { params: Promise.resolve(params) });
    expect(response.status).toBe(403);
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    ['the meeting', { meeting: false }],
    ['the public share', { share: false }],
    ['a cross-meeting target', { target: false }],
    ['an incomplete target', { incomplete: true }]
  ])('rejects when %s is unavailable', async (_label, state: QueryState) => {
    installQueries(state);
    const response = await POST(request({ version: 1 }), { params: Promise.resolve(params) });
    if (state.incomplete) expect(response.status).toBe(409);
    else expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE public_program_share'))).toBe(false);
  });

  it('uses exact ward and meeting predicates for meeting, share, and target lookups', async () => {
    await POST(request({ version: 1 }), { params: Promise.resolve(params) });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1::uuid AND ward_id = $2::uuid'), ['meeting-1', 'ward-1']);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('WHERE s.ward_id = $1::uuid AND s.meeting_id = $2::uuid'), ['ward-1', 'meeting-1']);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('WHERE ward_id = $1::uuid AND meeting_id = $2::uuid AND version = $3::int'), ['ward-1', 'meeting-1', 1]);
  });

  it('rolls back by changing only the public share pointer and expiration', async () => {
    const response = await POST(request({ version: 1 }), { params: Promise.resolve(params) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activeVersion: 1, previousActiveVersion: 2 });
    expect(mocks.expiration).toHaveBeenCalledWith(new Date('2026-01-01T10:00:00.000Z'), 30);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public_program_share SET active_render_id = $1::uuid, expires_at = $2::timestamptz'),
      ['render-1', new Date('2026-01-31T10:00:00.000Z'), 'ward-1', 'meeting-1']
    );
    expect(mocks.query.mock.calls.some(([sql]) => /UPDATE meeting_program_render|INSERT INTO meeting_program_render|DELETE FROM meeting_program_render/.test(String(sql)))).toBe(false);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'PROGRAM_ROLLBACK', wardId: 'ward-1', userId: 'user-1', entityId: 'meeting-1'
    }));
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
  });
});
