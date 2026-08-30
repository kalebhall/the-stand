'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

export function AuthSessionProvider({ session, children }: { session: Session | null; children: ReactNode }) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
