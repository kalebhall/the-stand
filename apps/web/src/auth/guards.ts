import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';

import { auth } from '@/src/auth/auth';

export async function requireAuthenticatedSession(): Promise<Session> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  return session;
}

export function enforcePasswordRotation(session: Session) {
  if (session.user.mustChangePassword && session.user.hasPassword) {
    redirect('/account/change-password');
  }
}
