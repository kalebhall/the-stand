import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';

export async function requireAuthenticatedSession() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  return session;
}

export function enforcePasswordRotation(session: Awaited<ReturnType<typeof auth>>) {
  if (session?.user?.mustChangePassword && session.user.hasPassword) {
    redirect('/account/change-password');
  }
}
