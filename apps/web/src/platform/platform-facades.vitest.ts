import { describe, expect, it, vi } from 'vitest';

vi.mock('@/src/auth/auth', () => ({ auth: vi.fn() }));

import { assertSessionWardAccess } from '@/src/platform/auth/session';
import { recordWardAuditEvent } from '@/src/platform/audit';
import { setDbContextForWard } from '@/src/platform/db/context';
import { PLATFORM_ERROR_CODES, PlatformError, toPlatformErrorResponse } from '@/src/platform/errors';
import { getContextFeatureFlags } from '@/src/platform/features/flags';
import { assertOfflineWardAccess } from '@/src/platform/offline/lifecycle';
import { assertPermissionWardAccess, canAccessWard } from '@/src/platform/permissions';
import { assertStakeAccess, assertWardAccess, createWardContext, type WardContext } from '@/src/platform/tenancy/context';

const context: WardContext = {
  userId: 'user-a',
  wardId: 'ward-a',
  activeStakeId: 'stake-a',
  stakeAssignments: [{ stakeId: 'stake-a', roleNames: ['STAKE_ADMIN'] }]
};

function expectWardRejection(operation: () => unknown | Promise<unknown>): Promise<void> {
  return expect(Promise.resolve().then(operation)).rejects.toMatchObject({ code: PLATFORM_ERROR_CODES.WARD_ACCESS_DENIED });
}

function expectForbidden(operation: () => unknown | Promise<unknown>): Promise<void> {
  return expect(Promise.resolve().then(operation)).rejects.toMatchObject({ code: PLATFORM_ERROR_CODES.FORBIDDEN });
}

describe('platform facades', () => {
  it('rejects cross-ward session access', async () => {
    await expectWardRejection(() => assertSessionWardAccess({ user: { id: 'user-a', roles: [], mustChangePassword: false, hasPassword: false }, activeWardId: 'ward-a' }, 'ward-b'));
  });

  it('rejects cross-ward tenancy access', async () => {
    await expectWardRejection(() => assertWardAccess(context, 'ward-b'));
    await expectWardRejection(() => createWardContext({ user: { id: 'user-a' }, activeWardId: 'ward-a' }, 'ward-b'));
  });

  it('rejects cross-stake tenancy access', async () => {
    await expectForbidden(() => assertStakeAccess(context, 'stake-b'));
  });

  it('rejects cross-ward permission access', async () => {
    await expectWardRejection(() => assertPermissionWardAccess(context, 'ward-b'));
    expect(canAccessWard({ activeWardId: 'ward-a' }, 'ward-b')).toBe(false);
  });

  it('rejects cross-ward DB context binding before querying', async () => {
    const client = { query: vi.fn(async () => undefined) };
    await expectWardRejection(() => setDbContextForWard(client, context, 'ward-b'));
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects cross-ward audit events and actor overrides', async () => {
    const client = { query: vi.fn(async () => undefined) };
    await expectWardRejection(() => recordWardAuditEvent(client, context, { action: 'TEST', wardId: 'ward-b' }));
    await expectForbidden(() => recordWardAuditEvent(client, context, { action: 'TEST', userId: 'user-b' }));
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects cross-ward feature-flag reads', async () => {
    await expectWardRejection(() => getContextFeatureFlags(context, 'ward-b'));
  });

  it('rejects cross-ward offline access', async () => {
    await expectWardRejection(() => assertOfflineWardAccess(context, 'ward-b'));
  });

  it('returns stable error contracts', () => {
    const error = new PlatformError(PLATFORM_ERROR_CODES.FORBIDDEN, 'Forbidden.', 403);
    expect(toPlatformErrorResponse(error)).toEqual({ error: 'Forbidden.', code: PLATFORM_ERROR_CODES.FORBIDDEN });
  });
});
