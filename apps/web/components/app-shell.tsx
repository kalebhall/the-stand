'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Session } from 'next-auth';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getNavigationItems } from '@/src/auth/navigation';
import { useConductingMode } from '@/components/conducting-mode-context';
import { DeploymentWatcher } from '@/components/deployment-watcher';
import { SiteLogo } from '@/components/site-logo';
import { NotificationBell } from '@/components/notification-bell';
import { AuthSessionRefresh } from '@/components/auth-session-refresh';

export function AppShell({
  session,
  children
}: {
  session: Session | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { isConductingMode, toggleConductingMode } = useConductingMode();
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  if (!session?.user?.id) {
    return <>{children}</>;
  }

  const navItems = getNavigationItems(session.user.roles);

  // Essential items for mobile bottom bar (max 5 + conducting trigger)
  const mobileEssentialHrefs = ['/dashboard', '/meetings', '/announcements', '/callings', '/members'];
  const mobileNavItems = navItems.filter((item) => mobileEssentialHrefs.includes(item.href));

  // If conducting mode is active: hide persistent chrome, show floating FAB button
  if (isConductingMode) {
    return (
      <div className="relative min-h-screen bg-background">
        <AuthSessionRefresh />
        {/* Main Content Area */}
        <div className="w-full pb-20 sm:pb-8">
          {children}
        </div>

        {/* Floating Action Button (FAB) for Conducting Mode */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
          {isFabMenuOpen && (
            <div className="flex flex-col gap-2 rounded-xl border bg-card/95 p-3 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-5">
              <div className="border-b pb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Conducting Stand Menu
              </div>
              <div className="flex flex-col gap-1 min-w-[180px]">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsFabMenuOpen(false)}
                    className={cn(
                      buttonVariants({
                        variant: pathname === item.href ? 'secondary' : 'ghost',
                        size: 'sm'
                      }),
                      'justify-start font-medium text-sm'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="my-1 border-t" />
                <Link
                  href="/account"
                  onClick={() => setIsFabMenuOpen(false)}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'justify-start text-xs text-muted-foreground')}
                >
                  {session.user.email}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsFabMenuOpen(false);
                    toggleConductingMode();
                  }}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'justify-start text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 mt-1'
                  )}
                >
                  Exit Conducting Mode
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-primary/20 transition-transform active:scale-95 hover:scale-105"
            aria-label="Open navigation menu in conducting mode"
            title="Conducting Mode Active (Click for Menu)"
          >
            {isFabMenuOpen ? (
              <span className="text-2xl font-bold">✕</span>
            ) : (
              <span className="text-2xl">🎙️</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AuthSessionRefresh />
      {/* Desktop Left Navigation Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30 border-r bg-card/60 backdrop-blur">
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-6">
          <SiteLogo className="text-lg" />
          <NotificationBell wardId={session.activeWardId} />
        </div>

        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-4 py-4">
          <nav className="space-y-1.5" aria-label="Desktop Navigation">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }),
                    'w-full justify-start text-sm font-medium gap-2.5 px-3 py-2',
                    isActive
                      ? 'bg-secondary text-secondary-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3 pt-4 border-t">
            {/* Deployment update watcher */}
            <DeploymentWatcher />

            {/* Stand Conducting Mode Trigger Button */}
            <button
              type="button"
              onClick={toggleConductingMode}
              className="flex w-full items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              title="Enter Stand Conducting Focus Mode"
            >
              <span className="flex items-center gap-1.5">
                <span>🎙️</span>
                <span>Stand Focus Mode</span>
              </span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px]">Enter</span>
            </button>

            <div className="space-y-1 text-xs text-muted-foreground">
              <Link
                href="/account"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full justify-start text-xs truncate px-2')}
              >
                {session.user.email}
              </Link>
              <div className="flex items-center justify-between px-2 pt-1">
                <Link href="/settings" className="hover:text-foreground text-[11px] underline-offset-2 hover:underline">
                  Settings
                </Link>
                <Link href="/logout" className="hover:text-foreground text-[11px] underline-offset-2 hover:underline">
                  Log out
                </Link>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col md:pl-64">
        {/* Mobile Top Bar with Conducting Mode Trigger */}
        <header className="md:hidden sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
          <SiteLogo className="text-base" iconClassName="h-6 w-6" />

          <div className="flex items-center gap-2">
            <NotificationBell wardId={session.activeWardId} />
            <button
              type="button"
              onClick={toggleConductingMode}
              className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 active:scale-95 transition-transform"
            >
              <span>🎙️</span>
              <span>Stand Mode</span>
            </button>
          </div>
        </header>

        {/* Page Content with bottom padding on mobile for permanent nav bar */}
        <main className="flex-1 pb-20 md:pb-8">
          {children}
        </main>

        {/* Mobile Permanent Bottom Bar (Essentials) */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-30 flex h-16 items-center justify-around border-t bg-card/95 px-2 backdrop-blur shadow-lg"
          aria-label="Mobile Bottom Navigation"
        >
          {mobileNavItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
