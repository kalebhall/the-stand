import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canUseInternalNotesMock, setDbContextMock, recordAuditEventMock, queryMock, releaseMock, connectMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    canUseInternalNotesMock: vi.fn(),
    setDbContextMock: vi.fn(),
    recordAuditEventMock: vi.fn(),
    queryMock: vi.fn(),
    releaseMock: vi.fn(),
    connectMock: vi.fn()
  })
);

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canUseInternalNotes: canUseInternalNotesMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: recordAuditEventMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));

import { POST } from './route';
import { PUT } from './[noteId]/route';

const wardId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const meetingId = '33333333-3333-4333-8333-333333333333';
const noteId = '44444444-4444-4444-8444-444444444444';

function request(body: unknown) {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

describe('internal notes routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: userId, email: 'leader@example.com', name: 'Leader', roles: ['STAND_ADMIN'] },
      activeWardId: wardId
    });
    canUseInternalNotesMock.mockReturnValue(true);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    recordAuditEventMock.mockResolvedValue(undefined);
  });

  it('creates a meeting note only after verifying ward-scoped target', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: meetingId }] }) // target
      .mockResolvedValueOnce({ rows: [{ id: noteId, created_at: '2026-08-28T00:00:00.000Z' }] }) // INSERT
      .mockResolvedValueOnce({}); // COMMIT

    const response = await POST(request({ target: { type: 'MEETING', meetingId }, visibility: 'PRIVATE', noteText: '  Follow up  ' }), {
      params: Promise.resolve({ wardId })
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: noteId, createdAt: '2026-08-28T00:00:00.000Z' });
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining('FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid'), [
      meetingId,
      wardId
    ]);
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.stringContaining('program_item_id'), [
      wardId,
      null,
      meetingId,
      null,
      'PRIVATE',
      'Follow up',
      userId
    ]);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'INTERNAL_NOTE_CREATED', entityId: noteId })
    );
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rejects invalid note payload before database access', async () => {
    const response = await POST(request({ target: { type: 'MEETING', meetingId }, visibility: 'PRIVATE', noteText: '   ' }), {
      params: Promise.resolve({ wardId })
    });

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('updates an existing note and records audit activity', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: noteId, visibility: 'PRIVATE', created_by_user_id: userId }] }) // existing
      .mockResolvedValueOnce({}) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT

    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ noteText: 'Updated note' }),
        headers: { 'content-type': 'application/json' }
      }),
      { params: Promise.resolve({ wardId, noteId }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE internal_note SET note_text = $1::text'), [
      'Updated note',
      noteId,
      wardId
    ]);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'INTERNAL_NOTE_UPDATED', entityId: noteId })
    );
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
  });
});
