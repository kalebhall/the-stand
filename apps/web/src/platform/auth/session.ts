import type { Session } from 'next-auth';

import { auth } from '@/src/auth/auth';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { assertWardAccess, createWardContext, type WardContext } from '@/src/platform/tenancy/context';

export type PlatformSession = Pick<Session, 'user'> & {
  activeWardId?: string | null;
  activeStakeId?: string | null;
  stakeAssignments?: readonly { stakeId: string; roleNames: readonly string[] }[];
};

export { auth, enforcePasswordRotation, requireAuthenticatedSession };

export function getSessionWardContext(session: PlatformSession): WardContext | null {
  const userId = session.user?.id;
  const wardId = session.activeWardId;
  if (!userId || !wardId) return null;
  return createWardContext(session);
}

export function assertSessionWardAccess(session: PlatformSession, targetWardId: string): void {
  const context = createWardContext(session, targetWardId);
  assertWardAccess(context, targetWardId);
}
