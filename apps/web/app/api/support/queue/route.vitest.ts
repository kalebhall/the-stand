import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, enqueueGlobalNotificationEventMock, insertGlobalNotificationEventMock, poolQueryMock, queryMock, releaseMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  enqueueGlobalNotificationEventMock: vi.fn(),
  insertGlobalNotificationEventMock: vi.fn(),
  poolQueryMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock, query: poolQueryMock } }));
vi.mock('@/src/notifications/global-outbox', () => ({
  enqueueGlobalNotificationEvent: enqueueGlobalNotificationEventMock,
  insertGlobalNotificationEvent: insertGlobalNotificationEventMock
}));
vi.mock('@/src/notifications/queue', () => ({ enqueueGlobalNotificationJob: vi.fn() }));

import { GET, PATCH } from './route';

const adminSession = { user: { id: '11111111-1111-4111-8111-111111111111', roles: ['SUPPORT_ADMIN'] } };
const queueItem = {
  id: '22222222-2222-4222-8222-222222222222',
  source_type: 'ACCESS_REQUEST',
  source_id: '33333333-3333-4333-8333-333333333333',
  status: 'UNASSIGNED',
  assigned_to_user_id: null,
  assigned_to_email: null,
  claimed_at: null,
  resolved_at: null,
  created_at: '2026-09-18T10:00:00.000Z',
  updated_at: '2026-09-18T10:00:00.000Z'
};

function patchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/support/queue', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('support queue route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQueryMock.mockResolvedValue({ rowCount: 1 });
    insertGlobalNotificationEventMock.mockResolvedValue('global-event-1');
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('rejects unauthenticated reads', async () => {
    authMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('rejects non-global administrators', async () => {
    authMock.mockResolvedValue({ user: { id: adminSession.user.id, roles: ['STAND_ADMIN'] } });

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it('rejects inactive global administrators', async () => {
    authMock.mockResolvedValue(adminSession);
    poolQueryMock.mockResolvedValue({ rowCount: 0, rows: [] });

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it('returns queue records to global administrators', async () => {
    authMock.mockResolvedValue(adminSession);
    poolQueryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [queueItem] })
      .mockResolvedValueOnce({ rows: [{ id: 'admin-2', email: 'admin@example.com' }] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          id: queueItem.id,
          sourceType: 'ACCESS_REQUEST',
          sourceId: queueItem.source_id,
          status: 'UNASSIGNED',
          assignedToUserId: null,
          assignedToEmail: null,
          claimedAt: null,
          resolvedAt: null,
          createdAt: queueItem.created_at,
          updatedAt: queueItem.updated_at
        }
      ],
      assignees: [{ id: 'admin-2', email: 'admin@example.com' }]
    });
  });

  it('claims an item only when expected timestamp still matches', async () => {
    authMock.mockResolvedValue(adminSession);
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...queueItem, status: 'ASSIGNED', assigned_to_user_id: adminSession.user.id }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await PATCH(
      patchRequest({
        id: queueItem.id,
        operation: 'CLAIM',
        expectedUpdatedAt: queueItem.updated_at
      })
    );

    expect(response.status).toBe(200);
    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock.mock.calls[1]?.[0]).toContain('updated_at = $6::timestamptz');
    expect(queryMock.mock.calls[1]?.[1]).toEqual([true, adminSession.user.id, 'ASSIGNED', true, queueItem.id, queueItem.updated_at]);
    expect(queryMock.mock.calls[2]?.[0]).toContain("'SUPPORT_WORK_ITEM'");
    expect(queryMock.mock.calls[2]?.[1]).toEqual([
      adminSession.user.id,
      'SUPPORT_WORK_ITEM_CLAIMED',
      queueItem.id,
      'ASSIGNED',
      adminSession.user.id
    ]);
    expect(queryMock).toHaveBeenNthCalledWith(4, 'COMMIT');
  });

  it('returns conflict when another administrator changed the item', async () => {
    authMock.mockResolvedValue(adminSession);
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({});

    const response = await PATCH(
      patchRequest({
        id: queueItem.id,
        operation: 'CLAIM',
        expectedUpdatedAt: queueItem.updated_at
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Queue item changed; reload and retry', code: 'CONFLICT' });
    expect(queryMock).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
