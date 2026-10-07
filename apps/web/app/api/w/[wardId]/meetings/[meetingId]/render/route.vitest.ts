import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canViewMeetingsMock, canUseInternalNotesMock, connectMock, setDbContextMock, moduleEnabledMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canViewMeetingsMock: vi.fn(),
  canUseInternalNotesMock: vi.fn(),
  connectMock: vi.fn(),
  setDbContextMock: vi.fn(),
  moduleEnabledMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canViewMeetings: canViewMeetingsMock, canUseInternalNotes: canUseInternalNotesMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock }));

import { GET } from './route';

const context = { params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' }) };
const session = {
  user: { id: 'user-1', roles: ['BISHOPRIC_EDITOR'] },
  activeWardId: 'ward-1'
};
let sqlCalls: string[] = [];

describe('basic meeting render route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(session);
    canViewMeetingsMock.mockReturnValue(true);
    canUseInternalNotesMock.mockReturnValue(false);
    moduleEnabledMock.mockResolvedValue(false);
    sqlCalls = [];
    connectMock.mockResolvedValue({
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        sqlCalls.push(sql);
        if (sql.includes('FROM meeting m')) {
          return {
            rows: [
              {
                id: 'meeting-1',
                meeting_date: '2026-01-01',
                meeting_type: 'SACRAMENT',
                status: 'PUBLISHED',
                default_locale: 'es',
                ward_name: 'Ward 1'
              }
            ]
          };
        }
        if (sql.includes('FROM meeting_program_item')) {
          return {
            rows: [
              {
                id: 'item-1',
                sequence: 1,
                item_type: 'SPEAKER',
                title: 'Speaker',
                notes: values?.[2] ? 'Private note' : null,
                topic: null,
                program_notes: null,
                hymn_number: null,
                hymn_title: null,
                introduction_roles: null,
                speaker_status: null
              }
            ]
          };
        }
        return { rows: [] };
      }),
      release: vi.fn()
    });
  });

  it('remains available and returns basic HTML when Programs is disabled', async () => {
    const response = await GET(new Request('http://localhost'), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const html = await response.text();
    expect(html).toContain('class="document-root document-fold--none');
    expect(html).toContain('Programa de la reunión sacramental');
    expect(html).not.toContain('Private note');
    expect(moduleEnabledMock).not.toHaveBeenCalled();
    expect(sqlCalls.find((sql) => sql.includes('FROM meeting m'))).toContain('w.default_locale');
    expect(sqlCalls.find((sql) => sql.includes('FROM meeting m'))).not.toContain('m.default_locale');
  });
});
