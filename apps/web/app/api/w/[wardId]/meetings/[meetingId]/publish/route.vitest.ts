import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canView: vi.fn(),
  canPublish: vi.fn(),
  canRepublish: vi.fn(),
  validatePublication: vi.fn(),
  setDbContext: vi.fn(),
  enqueue: vi.fn(),
  moduleEnabled: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
  state: {
    meetingStatus: 'DRAFT',
    shareToken: undefined as string | undefined,
    nextVersion: 1 as number | string,
    document: undefined as Record<string, unknown> | undefined,
    legacy: { preset: 'FULL_PAGE', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE' },
    insertId: 'render-1',
    insertVersion: 1,
    auditFailure: false
  }
}));
vi.mock('@/src/auth/auth', () => ({ auth: mocks.auth }));
vi.mock('@/src/auth/roles', () => ({
  canViewProgramDesigner: mocks.canView,
  canPublishProgram: mocks.canPublish,
  canRepublishProgram: mocks.canRepublish
}));
vi.mock('@/src/db/context', () => ({ setDbContext: mocks.setDbContext }));
vi.mock('@/src/notifications/queue', () => ({ enqueueOutboxNotificationJob: mocks.enqueue }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: mocks.moduleEnabled }));
vi.mock('@/src/db/client', () => ({ pool: { connect: mocks.connect } }));
vi.mock('@/src/document-designer/publication-validation', () => ({ validatePublication: mocks.validatePublication }));

import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';
import { POST } from './route';

type Params = { wardId: string; meetingId: string };
const params: Params = { wardId: 'ward-1', meetingId: 'meeting-1' };

function request(body?: unknown): Request {
  return new Request('http://localhost', body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
}

function installCurrentQueryModel(): void {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
    if (sql.includes('FROM meeting m JOIN ward')) {
      return { rowCount: 1, rows: [{ id: 'meeting-1', meeting_date: '2026-01-04', meeting_type: 'SACRAMENT', status: mocks.state.meetingStatus, ward_name: 'Ward', location: null }] };
    }
    if (sql.includes('FROM ward_document_settings')) {
      return { rows: [{ allow_program_editor_publish: true, allow_program_editor_republish: true, public_program_expiration_days: 30 }] };
    }
    if (sql.includes('FROM public_program_share')) return { rows: mocks.state.shareToken ? [{ token: mocks.state.shareToken }] : [] };
    if (sql.includes('MAX(version)')) return { rows: [{ next_version: mocks.state.nextVersion }] };
    if (sql.includes('FROM meeting_program_item')) return { rows: [{ item_type: 'OPENING_HYMN', title: null, notes: null, topic: null, program_notes: null, hymn_number: '1', hymn_title: 'The Morning Breaks', introduction_roles: null }] };
    if (sql.includes('FROM announcement')) return { rows: [] };
    if (sql.includes('FROM media_asset')) return { rows: [] };
    if (sql.includes('FROM user_account')) return { rows: [{ preferred_locale: 'en-US' }] };
    if (sql.includes('FROM meeting_document')) return { rows: mocks.state.document ? [mocks.state.document] : [] };
    if (sql.includes('FROM public_program_layout')) return { rows: [mocks.state.legacy] };
    if (sql.includes('INSERT INTO meeting_program_render')) return { rows: [{ id: mocks.state.insertId, version: mocks.state.insertVersion }] };
    if (sql.includes('INSERT INTO public_program_share')) return {};
    if (sql.includes("UPDATE meeting SET status = 'PUBLISHED'")) return {};
    if (sql.includes('INSERT INTO public_program_portal')) return {};
    if (sql.includes('INSERT INTO audit_log')) {
      if (mocks.state.auditFailure) throw new Error('audit database unavailable');
      return {};
    }
    if (sql.includes('INSERT INTO event_outbox')) return { rows: [{ id: 'event-1' }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
}

function publicationLayout() {
  return adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
}

describe('POST /api/w/[wardId]/meetings/[meetingId]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.state, {
      meetingStatus: 'DRAFT',
      shareToken: undefined,
      nextVersion: 1,
      document: undefined,
      legacy: { preset: 'FULL_PAGE', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE' },
      insertId: 'render-1',
      insertVersion: 1,
      auditFailure: false
    });
    mocks.auth.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    mocks.canView.mockReturnValue(true);
    mocks.canPublish.mockReturnValue(true);
    mocks.canRepublish.mockReturnValue(true);
    mocks.moduleEnabled.mockResolvedValue(true);
    mocks.validatePublication.mockReturnValue({ valid: true, errors: [], warnings: [], warningCodes: [], requiresWarningAcknowledgement: false });
    mocks.enqueue.mockResolvedValue(undefined);
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
    installCurrentQueryModel();
  });

  it('rejects malformed bodies before opening a database connection', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{"unexpected":true}' }), { params: Promise.resolve(params) });
    expect(response.status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('validates before mutation and rolls back without render/share/status writes', async () => {
    mocks.validatePublication.mockReturnValue({ valid: false, errors: [{ code: 'INVALID_PUBLIC_LINK' }], warnings: [], warningCodes: [], requiresWarningAcknowledgement: false });
    const response = await POST(request(), { params: Promise.resolve(params) });
    expect(response.status).toBe(422);
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.arrayContaining(['PROGRAM_PUBLISH_VALIDATION_FAILED']));
    const auditCall = mocks.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_log'));
    expect(auditCall?.[1]?.[11]).toBe(JSON.stringify({ meetingId: 'meeting-1', issueCodes: ['INVALID_PUBLIC_LINK'], warningCodes: [] }));
    expect(mocks.setDbContext).toHaveBeenCalledTimes(2);
    const rollbackIndex = mocks.query.mock.calls.findIndex(([sql]) => sql === 'ROLLBACK');
    const auditBeginIndex = mocks.query.mock.calls.findIndex(([sql], index) => index > rollbackIndex && sql === 'BEGIN');
    expect(rollbackIndex).toBeGreaterThanOrEqual(0);
    expect(auditBeginIndex).toBeGreaterThan(rollbackIndex);
    expect(mocks.query.mock.calls.some(([sql]) => /INSERT INTO meeting_program_render|INSERT INTO public_program_share|UPDATE meeting SET status/.test(sql))).toBe(false);
  });

  it('publishes the first immutable render and uses the returned id/version for the active pointer', async () => {
    const response = await POST(request(), { params: Promise.resolve(params) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, meetingId: 'meeting-1', version: 1, status: 'PUBLISHED' });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_program_render'), expect.any(Array));
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('RETURNING id, version'), expect.any(Array));
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO public_program_share'), ['ward-1', 'meeting-1', expect.any(String), 'render-1', expect.any(Date)]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.arrayContaining(['PROGRAM_PUBLISHED']));
  });

  it('republishes with the next positive version and preserves the stable share token', async () => {
    mocks.state.meetingStatus = 'PUBLISHED';
    mocks.state.shareToken = 'stable-token';
    mocks.state.nextVersion = '2';
    mocks.state.insertVersion = 2;
    mocks.state.insertId = 'render-2';
    const response = await POST(request(), { params: Promise.resolve(params) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: 2, status: 'PUBLISHED' });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO public_program_share'), ['ward-1', 'meeting-1', 'stable-token', 'render-2', expect.any(Date)]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.arrayContaining(['PROGRAM_REPUBLISHED']));
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO event_outbox'), expect.arrayContaining(['MEETING_REPUBLISHED']));
  });

  it('requires warning acknowledgement and then publishes when the warning code is acknowledged', async () => {
    mocks.validatePublication.mockReturnValueOnce({ valid: false, errors: [], warnings: [{ code: 'FLOWING_PAGE_COUNT' }], warningCodes: ['FLOWING_PAGE_COUNT'], requiresWarningAcknowledgement: true });
    const pending = await POST(request(), { params: Promise.resolve(params) });
    expect(pending.status).toBe(422);
    expect(await pending.json()).toEqual(expect.objectContaining({
      code: 'WARNING_ACKNOWLEDGEMENT_REQUIRED',
      warningCodes: ['FLOWING_PAGE_COUNT'],
      errors: []
    }));
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.arrayContaining(['PROGRAM_PUBLISH_VALIDATION_FAILED']));
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO meeting_program_render'))).toBe(false);

    vi.clearAllMocks();
    mocks.validatePublication.mockReturnValue({ valid: true, errors: [], warnings: [{ code: 'FLOWING_PAGE_COUNT' }], warningCodes: ['FLOWING_PAGE_COUNT'], requiresWarningAcknowledgement: false });
    installCurrentQueryModel();
    const acknowledged = await POST(request({ acknowledgedWarningCodes: ['FLOWING_PAGE_COUNT'] }), { params: Promise.resolve(params) });
    const acknowledgedCall = mocks.validatePublication.mock.calls.at(-1);
    expect(acknowledgedCall?.[1]).toMatchObject({ acknowledgedWarningCodes: ['FLOWING_PAGE_COUNT'] });
    expect(acknowledged.status).toBe(200);
  });

  it('preserves the validation response when validation-failure auditing fails', async () => {
    mocks.validatePublication.mockReturnValue({ valid: false, errors: [{ code: 'INVALID_PUBLIC_LINK', message: 'private detail' }], warnings: [], warningCodes: [], requiresWarningAcknowledgement: false });
    mocks.state.auditFailure = true;
    const response = await POST(request(), { params: Promise.resolve(params) });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Publication validation failed',
      code: 'PUBLICATION_VALIDATION_FAILED',
      errors: [{ code: 'INVALID_PUBLIC_LINK', message: 'private detail' }],
      warnings: [],
      warningCodes: []
    });
    expect(mocks.query.mock.calls.some(([sql]) => /INSERT INTO meeting_program_render|INSERT INTO public_program_share|UPDATE meeting SET status/.test(sql))).toBe(false);
  });

  it('uses the persisted document source instead of falling back to legacy draft layout data', async () => {
    mocks.state.document = { layout_json: publicationLayout(), source_template_id: 'template-1', source_template_version: '3' };
    const response = await POST(request(), { params: Promise.resolve(params) });
    expect(response.status).toBe(200);
    const renderCall = mocks.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO meeting_program_render'));
    expect(renderCall?.[1]).toEqual(expect.arrayContaining(['template-1', 3]));
  });

  it('fails safely when next_version is not a positive integer', async () => {
    mocks.state.nextVersion = 'not-a-number';
    const response = await POST(request(), { params: Promise.resolve(params) });
    expect(response.status).toBe(500);
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO meeting_program_render'))).toBe(false);
  });
});
