import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewProgramDesignerMock, canPublishProgramMock, canRepublishProgramMock, setDbContextMock, enqueueOutboxNotificationJobMock, queryMock, releaseMock, connectMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    canViewProgramDesignerMock: vi.fn(),
    canPublishProgramMock: vi.fn(),
    canRepublishProgramMock: vi.fn(),
    setDbContextMock: vi.fn(),
    enqueueOutboxNotificationJobMock: vi.fn(),
    queryMock: vi.fn(),
    releaseMock: vi.fn(),
    connectMock: vi.fn()
  }));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewProgramDesigner: canViewProgramDesignerMock, canPublishProgram: canPublishProgramMock, canRepublishProgram: canRepublishProgramMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/notifications/queue', () => ({ enqueueOutboxNotificationJob: enqueueOutboxNotificationJobMock }));
vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { POST } from './route';
import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';

describe('POST /api/w/[wardId]/meetings/[meetingId]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authMock.mockResolvedValue({
      user: { id: 'user-1', roles: ['STAND_ADMIN'] },
      activeWardId: 'ward-1'
    });
    canViewProgramDesignerMock.mockReturnValue(true);
    canPublishProgramMock.mockReturnValue(true);
    canRepublishProgramMock.mockReturnValue(true);
    enqueueOutboxNotificationJobMock.mockResolvedValue(undefined);

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });

    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // LOCK TABLE meeting_program_render
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'meeting-1', meeting_date: '2026-01-04', meeting_type: 'SACRAMENT', status: 'DRAFT' }]
      }) // SELECT meeting
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ item_type: 'OPENING_HYMN', title: null, notes: null, hymn_number: '1', hymn_title: 'The Morning Breaks' }]
      }) // SELECT program items
      .mockResolvedValueOnce({ rows: [] }) // SELECT announcements
      .mockResolvedValueOnce({ rows: [{ preset: 'FULL_PAGE', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE' }] }) // SELECT public layout
      .mockResolvedValueOnce({ rows: [] }) // SELECT meeting document
      .mockResolvedValueOnce({ rows: [] }) // SELECT public share token
      .mockResolvedValueOnce({ rows: [{ latest_version: 1 }] }) // SELECT COALESCE MAX version
      .mockResolvedValueOnce({ rows: [{ allow_program_editor_publish: false, allow_program_editor_republish: false }] }) // SELECT program publish settings
      .mockResolvedValueOnce({ rows: [{ preferred_locale: 'es' }] }) // SELECT user locale
      .mockResolvedValueOnce({ rows: [] }) // SELECT active authorized media
      .mockResolvedValueOnce({}) // INSERT meeting_program_render
      .mockResolvedValueOnce({}) // UPDATE meeting status
      .mockResolvedValueOnce({}) // INSERT public_program_share
      .mockResolvedValueOnce({}) // INSERT public_program_portal
      .mockResolvedValueOnce({}) // INSERT audit_log
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] }) // INSERT event_outbox RETURNING id
      .mockResolvedValueOnce({}); // COMMIT
  });

  it('creates a new immutable render version and marks meeting as published', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, meetingId: 'meeting-1', version: 2, status: 'PUBLISHED' });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_program_render'), [
      'ward-1',
      'meeting-1',
      2,
      expect.stringContaining('Programa de la reunión sacramental'),
      null,
      null
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("SET status = 'PUBLISHED'"), ['meeting-1', 'ward-1']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'), expect.arrayContaining(['ward-1', 'user-1', 'MEETING_REPUBLISHED']));
    expect(releaseMock).toHaveBeenCalled();
  });

  it('publishes a persisted document layout through the compatibility renderer', async () => {
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // LOCK TABLE meeting_program_render
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'meeting-1', meeting_date: '2026-01-04', meeting_type: 'SACRAMENT', status: 'DRAFT' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ item_type: 'OPENING_HYMN', title: 'Opening hymn', notes: null, topic: null, program_notes: null, hymn_number: '1', hymn_title: 'The Morning Breaks' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ preset: 'FULL_PAGE', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE' }] })
      .mockResolvedValueOnce({ rows: [{ layout_json: adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' }) }] })
      .mockResolvedValueOnce({ rows: [{ token: 'stable-token' }] })
      .mockResolvedValueOnce({ rows: [{ latest_version: 0 }] })
      .mockResolvedValueOnce({ rows: [{ allow_program_editor_publish: false, allow_program_editor_republish: false }] })
      .mockResolvedValueOnce({ rows: [{ preferred_locale: 'en-US' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] })
      .mockResolvedValueOnce({});

    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' })
    });

    expect(response.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_program_render'), [
      'ward-1',
      'meeting-1',
      1,
      expect.stringContaining('document-root'),
      expect.any(String),
      expect.any(String)
    ]);
  });
});
