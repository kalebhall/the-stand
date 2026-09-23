import type { Session } from 'next-auth';

import { auth } from '@/src/auth/auth';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';

export type PlatformSession = Pick<Session, 'user'> & {
  activeWardId?: string | null;
};

export { auth, enforcePasswordRotation, requireAuthenticatedSession };

export function getSessionWardContext(session: PlatformSession): WardContext | null {
  const userId = session.user?.id;
  const wardId = session.activeWardId;
  if (!userId || !wardId) return null;
  return { userId, wardId };
}

export function assertSessionWardAccess(session: PlatformSession, targetWardId: string): void {
  const context = getSessionWardContext(session);
  if (!context) {
    throw new Error('An authenticated session with an active ward is required.');
  }
  assertWardAccess(context, targetWardId);
}
