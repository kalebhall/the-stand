import './globals.css';

import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { AuthSessionProvider } from '@/components/auth-session-provider';
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
  const locale = await getLocale();
  const messages = await getMessages();
  const shouldShowNavigation = Boolean(session?.user?.id) && !(session?.user.mustChangePassword && session.user.hasPassword);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthSessionProvider session={session}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
              {shouldShowNavigation ? <AppShell session={session}>{children}</AppShell> : children}
            </ThemeProvider>
          </AuthSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
