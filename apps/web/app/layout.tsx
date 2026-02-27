import './globals.css';

import type { ReactNode } from 'react';

import { AppNavigation } from '@/components/app-navigation';
import { ThemeProvider } from '@/components/theme-provider';
import { auth } from '@/src/auth/auth';
import { ensureSupportAdminBootstrap } from '@/src/db/bootstrap-support-admin';

export default async function RootLayout({ children }: { children: ReactNode }) {
  await ensureSupportAdminBootstrap();

  const session = await auth();
  const shouldShowNavigation = Boolean(session?.user?.id) && !(session?.user.mustChangePassword && session.user.hasPassword);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {shouldShowNavigation ? <AppNavigation session={session} /> : null}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}