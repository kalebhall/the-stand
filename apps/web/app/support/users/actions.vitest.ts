import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, queryMock, releaseMock, revalidatePathMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  revalidatePathMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ hasRole: vi.fn(() => true) }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { deleteUser } from './actions';

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
