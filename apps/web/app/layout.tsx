import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { AuthSessionProvider } from '@/components/auth-session-provider';
import { ConductingModeProvider } from '@/components/conducting-mode-context';
import { ThemeProvider } from '@/components/theme-provider';
import { auth } from '@/src/auth/auth';
import { ensureSupportAdminBootstrap } from '@/src/db/bootstrap-support-admin';

export const metadata: Metadata = {
  title: {
    default: 'The Stand',
    template: '%s | The Stand'
  },
  description: 'Prepare, conduct, and share ward sacrament meeting programs.'
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await ensureSupportAdminBootstrap();

  const session = await auth();
  const shouldShowNavigation = Boolean(session?.user?.id) && !(session?.user.mustChangePassword && session.user.hasPassword);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AuthSessionProvider session={session}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <ConductingModeProvider>
              {shouldShowNavigation ? <AppShell session={session}>{children}</AppShell> : children}
            </ConductingModeProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
