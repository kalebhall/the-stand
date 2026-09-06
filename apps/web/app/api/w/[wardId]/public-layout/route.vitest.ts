import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canManageMeetingsMock, setDbContextMock, queryMock, releaseMock, connectMock, recordAuditEventMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canManageMeetingsMock: vi.fn(),
  setDbContextMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn(),
  recordAuditEventMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canManageMeetings: canManageMeetingsMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/audit/service', async () => {
  const actual = await vi.importActual<typeof import('@/src/audit/service')>('@/src/audit/service');
  return { ...actual, recordAuditEvent: recordAuditEventMock };
});

import { PATCH } from './route';

describe('PATCH /api/w/[wardId]/public-layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', name: 'Bishop', roles: ['BISHOPRIC_EDITOR'] }, activeWardId: 'ward-1' });
    canManageMeetingsMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    recordAuditEventMock.mockResolvedValue(undefined);
  });

  it('records before/after layout state in same transaction', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ preset: 'FULL_PAGE', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE', cover_image_url: null, cover_image_alt_text: null }] })
      .mockResolvedValueOnce({ rows: [{ preset: 'TRI_FOLD_BULLETIN', announcement_mode: 'BACK_PANEL', cover_mode: 'NONE', cover_image_url: null, cover_image_alt_text: null }] })
      .mockResolvedValueOnce({});

    const response = await PATCH(new Request('http://localhost/api/w/ward-1/public-layout', {
      method: 'PATCH',
      body: JSON.stringify({ preset: 'TRI_FOLD_BULLETIN', announcementMode: 'BACK_PANEL', coverMode: 'NONE' })
    }), { params: Promise.resolve({ wardId: 'ward-1' }) });

    expect(response.status).toBe(200);
    expect(recordAuditEventMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'PUBLIC_LAYOUT_UPDATED',
      entityType: 'ward_setting',
      entityId: 'ward-1',
      previousState: expect.objectContaining({ preset: 'FULL_PAGE' }),
      changes: expect.objectContaining({
        preset: { old: 'FULL_PAGE', new: 'TRI_FOLD_BULLETIN' },
        announcement_mode: { old: 'AFTER_PROGRAM', new: 'BACK_PANEL' }
      })
    }));
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });

  it('does not write audit event when layout is unchanged', async () => {
    const row = { preset: 'FULL_PAGE', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE', cover_image_url: null, cover_image_alt_text: null };
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({});

    const response = await PATCH(new Request('http://localhost/api/w/ward-1/public-layout', {
      method: 'PATCH',
      body: JSON.stringify({ preset: row.preset, announcementMode: row.announcement_mode, coverMode: row.cover_mode })
    }), { params: Promise.resolve({ wardId: 'ward-1' }) });

    expect(response.status).toBe(200);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});
