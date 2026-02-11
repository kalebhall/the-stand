import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, logAuditActionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  logAuditActionMock: vi.fn()
}));

vi.mock('./client', () => ({
  pool: { query: queryMock }
}));

vi.mock('./audit', () => ({
  logAuditAction: logAuditActionMock
}));

import { assignWardRole, revokeWardRole } from './roles';

describe('role assignment auditing', () => {
  beforeEach(() => {
    queryMock.mockReset();
    logAuditActionMock.mockReset();
  });

  it('writes audit entry when assigning ward role', async () => {
    await assignWardRole({
      actorUserId: 'actor-1',
      wardId: 'ward-1',
      targetUserId: 'target-1',
      roleName: 'STAND_ADMIN'
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(logAuditActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WARD_ROLE_ASSIGNED',
        actorUserId: 'actor-1',
        wardId: 'ward-1'
      })
    );
  });

  it('writes audit entry when revoking ward role', async () => {
    await revokeWardRole({
      actorUserId: 'actor-1',
      wardId: 'ward-1',
      targetUserId: 'target-1',
      roleName: 'STAND_ADMIN'
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(logAuditActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WARD_ROLE_REVOKED',
        actorUserId: 'actor-1',
        wardId: 'ward-1'
      })
    );
  });
});
