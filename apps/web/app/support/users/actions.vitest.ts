import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  connectMock,
  enqueueGlobalNotificationEventMock,
  enqueueGlobalNotificationJobMock,
  poolQueryMock,
  queryMock,
  releaseMock,
  revalidatePathMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  enqueueGlobalNotificationEventMock: vi.fn(),
  enqueueGlobalNotificationJobMock: vi.fn(),
  poolQueryMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  revalidatePathMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ hasRole: vi.fn(() => true) }));
vi.mock('@/src/auth/password', () => ({ hashPassword: vi.fn(async () => 'password-hash') }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock, query: poolQueryMock } }));
vi.mock('@/src/notifications/global-outbox', () => ({ enqueueGlobalNotificationEvent: enqueueGlobalNotificationEventMock }));
vi.mock('@/src/notifications/queue', () => ({ enqueueGlobalNotificationJob: enqueueGlobalNotificationJobMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { createUser, deleteUser } from './actions';

describe('createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'admin-1', roles: ['SUPPORT_ADMIN'] } });
  });

  it('creates an assignment work item atomically with a support-created user', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-1', email: 'new@example.com', global_event_id: 'event-1' }] })
      .mockResolvedValueOnce({});

    const formData = new FormData();
    formData.set('email', 'new@example.com');
    formData.set('displayName', 'New User');
    formData.set('password', 'long-enough-password');
    await createUser(formData);

    expect(poolQueryMock.mock.calls[0]?.[0]).toContain('INSERT INTO support_work_item');
    expect(poolQueryMock.mock.calls[0]?.[0]).toContain("SELECT 'USER_ACCOUNT', id");
    expect(poolQueryMock.mock.calls[0]?.[0]).toContain("'USER_REQUIRES_ASSIGNMENT'");
    expect(poolQueryMock.mock.calls[0]?.[0]).not.toContain('message');
    expect(enqueueGlobalNotificationEventMock).toHaveBeenCalledWith(enqueueGlobalNotificationJobMock, 'event-1');
    expect(poolQueryMock.mock.calls[1]?.[0]).toContain("'SUPPORT_USER_CREATED'");
  });

  it('does not create another work item or event for duplicate support intake', async () => {
    poolQueryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const formData = new FormData();
    formData.set('email', 'existing@example.com');
    formData.set('password', 'long-enough-password');
    await createUser(formData);

    expect(poolQueryMock).toHaveBeenCalledOnce();
    expect(enqueueGlobalNotificationEventMock).not.toHaveBeenCalled();
  });
});

describe('deleteUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'admin-1', roles: ['SUPPORT_ADMIN'] } });
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('deletes target user and records audit event in one transaction', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-1', email: 'deleted@example.com' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const formData = new FormData();
    formData.set('userId', 'user-1');
    await deleteUser(formData);

    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock).toHaveBeenNthCalledWith(2, 'DELETE FROM user_account WHERE id = $1::uuid RETURNING id, email', ['user-1']);
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("'SUPPORT_USER_DELETED'"),
      ['admin-1', 'user-1', 'deleted@example.com']
    );
    expect(queryMock).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(revalidatePathMock).toHaveBeenCalledWith('/support/users');
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it('rolls back when deletion fails', async () => {
    const failure = new Error('foreign key failure');
    queryMock.mockResolvedValueOnce({}).mockRejectedValueOnce(failure).mockResolvedValueOnce({});

    const formData = new FormData();
    formData.set('userId', 'user-1');
    await expect(deleteUser(formData)).rejects.toThrow('Failed to delete user');
    expect(queryMock).toHaveBeenLastCalledWith('ROLLBACK');
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
