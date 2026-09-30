import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canEditMock, canViewMock, moduleEnabledMock, setDbContextMock, queryMock, releaseMock, connectMock, saveMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canEditMock: vi.fn(),
  canViewMock: vi.fn(),
  moduleEnabledMock: vi.fn(),
  setDbContextMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn(),
  saveMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canEditProgramDesign: canEditMock, canViewProgramDesigner: canViewMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/programs/baptism-persistence', () => ({ saveBaptismProgramDocument: saveMock, loadBaptismProgramDocument: vi.fn() }));

import { GET, POST } from './route';

const session = { user: { id: 'user-1', roles: ['PROGRAM_EDITOR'] }, activeWardId: 'ward-1' };
const validPayload = {
  date: '2026-11-01',
  title: 'Baptism Service',
  location: 'Meetinghouse',
  participantDisplayName: 'Jordan Hall',
  programItems: [{ key: 'opening', label: 'Opening hymn', content: 'Hymn 1', sequence: 0 }]
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(session);
  canViewMock.mockReturnValue(true);
  canEditMock.mockReturnValue(true);
  moduleEnabledMock.mockResolvedValue(true);
  connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  saveMock.mockResolvedValue({ id: 'baptism-event-program:event-1', programType: 'BAPTISM_PROGRAM', source: { sourceType: 'BAPTISM_EVENT', sourceId: 'event-1', sourceVersion: '1' }, schemaVersion: 1, metadata: { title: 'Baptism Service' }, payload: { template: 'STANDARD_BAPTISM', participantDisplayName: 'Jordan Hall', items: [] }, revision: 1, updatedByUserId: 'private-user-id', updatedAt: null });
});

describe('baptism Programs route', () => {
  it('requires the active ward for reads', async () => {
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-2' }) });
    expect(response.status).toBe(403);
  });

  it('lists only safe ward-scoped source fields', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ enabled: true }] }).mockResolvedValueOnce({ rows: [{ source_id: 'event-1', source_version: '1', source_json: { wardId: 'ward-1', eventId: 'event-1', eventVersion: '1', date: '2026-11-01', title: 'Baptism Service', location: null, participantDisplayName: 'Jordan Hall', programItems: [], privateNote: 'do not expose' }, revision: 1, updated_at: null }, { source_id: 'event-2', source_version: '1', source_json: { wardId: 'ward-1', eventId: 'wrong-event', eventVersion: '1', date: '2026-11-02', title: 'Wrong identity', location: null, participantDisplayName: 'Jordan Hall', programItems: [] }, revision: 1, updated_at: null }] }).mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ programs: [{ eventId: 'event-1', eventVersion: '1', source: { eventId: 'event-1', eventVersion: '1', date: '2026-11-01', title: 'Baptism Service', location: null, participantDisplayName: 'Jordan Hall', programItems: [] }, revision: 1, updatedAt: null }] });
    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock).toHaveBeenNthCalledWith(4, expect.stringContaining('d.source_version = s.source_version'), ['ward-1']);
    expect(queryMock).toHaveBeenNthCalledWith(5, 'COMMIT');
  });

  it('creates the authoritative source and document in one transaction', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ enabled: true }] }).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(validPayload) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(201);
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ wardId: 'ward-1', document: expect.objectContaining({ programType: 'BAPTISM_PROGRAM' }) }));
    expect((await response.clone().json()).program.updatedByUserId).toBeUndefined();
    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock).toHaveBeenNthCalledWith(5, 'COMMIT');
  });

  it('rechecks module enablement inside the transaction', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ enabled: false }] }).mockResolvedValueOnce({});
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(validPayload) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(404);
    expect(queryMock).toHaveBeenLastCalledWith('ROLLBACK');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('rejects malformed creation payloads before opening a database connection', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ ...validPayload, programItems: 'invalid' }) }), { params: Promise.resolve({ wardId: 'ward-1' }) });
    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
