import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, recordAuditEventMock, buildFieldDiffMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  buildFieldDiffMock: vi.fn(() => ({ allowAdvancedProgramDesigner: { old: false, new: true } }))
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/audit/service', () => ({ buildFieldDiff: buildFieldDiffMock, recordAuditEvent: recordAuditEventMock }));

import { GET, PATCH } from './route';

const session = {
  user: { id: 'user-a', name: 'Program Admin', email: 'admin@example.test', roles: ['STAND_ADMIN'] },
  activeWardId: 'ward-a'
};

const row = {
  ward_id: 'ward-a',
  default_sacrament_template_id: null,
  allow_advanced_program_designer: false,
  allow_program_editor_publish: false,
  allow_program_editor_republish: false,
  allow_program_editor_rollback: false,
  allow_program_editor_create_templates: false,
  allow_program_editor_delete_media: false,
  public_program_expiration_days: null
};

function setupClient(overrides: Record<string, unknown> = {}) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql === 'SELECT set_config($1, $2, true)') return { rows: [] };
      if (sql.startsWith('SELECT ward_id')) return { rows: [row] };
      if (sql.startsWith('INSERT INTO ward_document_settings')) return { rows: [{ ...row, allow_advanced_program_designer: true }] };
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      return { rows: [], ...overrides };
    }),
    release: vi.fn()
  };
  connectMock.mockResolvedValue(client);
  return client;
}

const context = { params: Promise.resolve({ wardId: 'ward-a' }) };

describe('program settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(session);
  });

  it('returns unauthorized without a session', async () => {
    authMock.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost'), context);
    expect(response.status).toBe(401);
  });

  it('rejects a different active ward', async () => {
    authMock.mockResolvedValue({ ...session, activeWardId: 'ward-b' });
    const response = await GET(new Request('http://localhost'), context);
    expect(response.status).toBe(403);
  });

  it('returns persisted false settings instead of assuming enabled defaults', async () => {
    setupClient();
    const response = await GET(new Request('http://localhost'), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: {
      defaultSacramentTemplateId: null,
      allowAdvancedProgramDesigner: false,
      allowProgramEditorPublish: false,
      allowProgramEditorRepublish: false,
      allowProgramEditorRollback: false,
      allowProgramEditorCreateTemplates: false,
      allowProgramEditorDeleteMedia: false,
      publicProgramExpirationDays: null
    }});
  });

  it('requires boolean settings and rejects an empty payload', async () => {
    setupClient();
    const response = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) }), context);
    expect(response.status).toBe(400);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it('allows only STAND_ADMIN to change settings and audits the persisted change', async () => {
    const client = setupClient();
    const response = await PATCH(new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ allowAdvancedProgramDesigner: true })
    }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ settings: { allowAdvancedProgramDesigner: true } });
    expect(recordAuditEventMock).toHaveBeenCalledWith(client, expect.objectContaining({ action: 'PROGRAM_SETTINGS_UPDATED' }));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (ward_id)'), expect.arrayContaining(['ward-a', true]));
  });

  it('denies PROGRAM_EDITOR settings writes', async () => {
    authMock.mockResolvedValue({ ...session, user: { ...session.user, roles: ['PROGRAM_EDITOR'] } });
    const response = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ allowAdvancedProgramDesigner: true }) }), context);
    expect(response.status).toBe(403);
  });

  it('returns stable internal errors for database failures', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('db down')), release: vi.fn() };
    connectMock.mockResolvedValue(client);
    const response = await GET(new Request('http://localhost'), context);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(client.release).toHaveBeenCalled();
  });
});
