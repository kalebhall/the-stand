'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Session } from 'next-auth';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getNavigationGroups, type AppNavGroup } from '@/src/auth/navigation';
import { DeploymentWatcher } from '@/components/deployment-watcher';
import { SiteLogo } from '@/components/site-logo';
import { NotificationBell } from '@/components/notification-bell';
import { AuthSessionRefresh } from '@/components/auth-session-refresh';
import { createModuleEnablement } from '@/src/modules/enablement';
import type { EffectiveModuleSetting } from '@/src/modules/service';

const NAV_GROUP_STORAGE_PREFIX = 'the-stand:navigation-groups:';
const SIDEBAR_STORAGE_PREFIX = 'the-stand:sidebar-collapsed:';

function NavigationGroups({
  groups,
  pathname,
  expandedGroups,
  onToggle,
  onNavigate,
  ariaLabel
}: {
  groups: AppNavGroup[];
  pathname: string | null;
  expandedGroups: Record<string, boolean>;
  onToggle: (groupId: string) => void;
  onNavigate?: () => void;
  ariaLabel: string;
}) {
  return (
    <nav className="space-y-3" aria-label={ariaLabel}>
      {groups.map((group) => {
        const hasActiveItem = group.items.some((item) => pathname === item.href || pathname?.startsWith(`${item.href}/`));
        const isExpanded = hasActiveItem || (expandedGroups[group.id] ?? true);
        return (
          <section key={group.id} aria-labelledby={`${group.id}-navigation-heading`}>
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              aria-expanded={isExpanded}
              aria-controls={`${group.id}-navigation-links`}
              onClick={() => onToggle(group.id)}
            >
              <span id={`${group.id}-navigation-heading`}>{group.label}</span>
              <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
            </button>
            {isExpanded ? (
              <div id={`${group.id}-navigation-links`} className="mt-1 space-y-1.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }),
                        'w-full justify-start gap-2.5 px-3 py-2 text-sm font-medium',
                        isActive
                          ? 'border-l-2 border-primary bg-secondary font-semibold text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </nav>
  );
}

export function AppShell({ session, children }: { session: Session | null; children: ReactNode }) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [moduleSettings, setModuleSettings] = useState<EffectiveModuleSetting[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const isDevelopmentSite = process.env.NEXT_PUBLIC_APP_ENV === 'development';

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!session?.activeWardId) return;
    let cancelled = false;
    void fetch(`/api/w/${session.activeWardId}/module-settings`, { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ modules?: EffectiveModuleSetting[] }>) : null))
      .then((body) => {
        if (!cancelled && body?.modules) setModuleSettings(body.modules);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session?.activeWardId]);

  const navigationStorageKey = session?.user?.id && session.activeWardId
    ? `${NAV_GROUP_STORAGE_PREFIX}${session.user.id}:${session.activeWardId}`
    : null;
  const sidebarStorageKey = session?.user?.id && session.activeWardId
    ? `${SIDEBAR_STORAGE_PREFIX}${session.user.id}:${session.activeWardId}`
    : null;

  useEffect(() => {
    if (!sidebarStorageKey) return;
    setIsSidebarCollapsed(false);
    try {
      setIsSidebarCollapsed(localStorage.getItem(sidebarStorageKey) === 'true');
    } catch {
      // Ignore unavailable local preferences.
    }
  }, [sidebarStorageKey]);

  useEffect(() => {
    if (!navigationStorageKey) return;
    setExpandedGroups({});
    try {
      const stored = localStorage.getItem(navigationStorageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setExpandedGroups(parsed as Record<string, boolean>);
        }
      }
    } catch {
      // Ignore unavailable or malformed local preferences.
    }
  }, [navigationStorageKey]);

  const toggleNavigationGroup = (groupId: string) => {
    setExpandedGroups((current) => {
      const next = { ...current, [groupId]: !(current[groupId] ?? true) };
      if (navigationStorageKey) {
        try {
          localStorage.setItem(navigationStorageKey, JSON.stringify(next));
        } catch {
          // Ignore unavailable local preferences.
        }
      }
      return next;
    });
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      if (sidebarStorageKey) {
        try {
          localStorage.setItem(sidebarStorageKey, String(next));
        } catch {
          // Ignore unavailable local preferences.
        }
      }
      return next;
    });
  };

  if (!session?.user?.id) {
    return <>{children}</>;
  }

  const moduleEnablement = createModuleEnablement();
  for (const module of moduleSettings) moduleEnablement.setEnabled(session.activeWardId ?? 'default', module.id, module.enabled);
  const notificationsEnabled = moduleSettings.some((module) => module.id === 'notifications' && module.enabled);
  const navGroups = getNavigationGroups(session.user.roles, session.activeWardId ?? undefined, moduleEnablement);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AuthSessionRefresh />
      {/* Desktop Left Navigation Sidebar (hidden on mobile) */}
      <aside
        className={cn(
          'hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30 border-r border-[#c8d7de] bg-card/95 backdrop-blur',
          isSidebarCollapsed && 'md:hidden'
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#c8d7de] px-6">
          <div className="flex items-center gap-2">
            <SiteLogo className="text-lg text-primary" />
            {isDevelopmentSite ? (
              <span
                className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] text-amber-800 dark:text-amber-200"
                aria-label="Development site"
              >
                DEV
              </span>
            ) : null}
          </div>
          {notificationsEnabled && <NotificationBell wardId={session.activeWardId} />}
        </div>

        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-4 py-4">
          <NavigationGroups
            groups={navGroups}
            pathname={pathname}
            expandedGroups={expandedGroups}
            onToggle={toggleNavigationGroup}
            ariaLabel="Desktop Navigation"
          />

          <div className="space-y-3 pt-4 border-t">
            {/* Deployment update watcher */}
            <DeploymentWatcher />

            <button
              type="button"
              onClick={toggleSidebar}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Collapse navigation menu"
            >
              <span>Collapse menu</span>
              <span aria-hidden="true">‹</span>
            </button>

            <div className="space-y-1 text-xs text-muted-foreground">
              <Link
                href="/account"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full justify-start text-xs truncate px-2')}
              >
                {session.user.email}
              </Link>
              <div className="flex items-center justify-between px-2 pt-1">
                <Link href="/manual" className="text-[11px] hover:text-foreground hover:underline">
                  Help / Manual
                </Link>
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
      <div className={cn('flex flex-1 flex-col', !isSidebarCollapsed && 'md:pl-64')}>
        {/* Mobile top bar */}
        <header
          className={cn(
            'sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur',
            !isSidebarCollapsed && 'md:hidden'
          )}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-lg hover:bg-accent"
              aria-label="Open navigation menu"
              aria-expanded={isMobileNavOpen}
              aria-controls="mobile-navigation"
            >
              <span aria-hidden="true">☰</span>
            </button>
            <div className="flex items-center gap-2">
              <SiteLogo className="text-base text-primary" iconClassName="h-6 w-6" />
              {isDevelopmentSite ? (
                <span
                  className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] text-amber-800 dark:text-amber-200"
                  aria-label="Development site"
                >
                  DEV
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {notificationsEnabled && <NotificationBell wardId={session.activeWardId} />}
          </div>
        </header>

        {isMobileNavOpen ? (
          <>
            <button
              type="button"
              className={cn('fixed inset-0 z-30 bg-black/40', !isSidebarCollapsed && 'md:hidden')}
              aria-label="Close navigation menu"
              onClick={() => setIsMobileNavOpen(false)}
            />
            <aside
              id="mobile-navigation"
              className={cn(
                'fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-xl',
                !isSidebarCollapsed && 'md:hidden'
              )}
              aria-label="Mobile Navigation"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b px-5">
                <div className="flex items-center gap-2">
                  <SiteLogo className="text-lg text-primary" />
                  {isDevelopmentSite ? (
                    <span
                      className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] text-amber-800 dark:text-amber-200"
                      aria-label="Development site"
                    >
                      DEV
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-lg hover:bg-accent"
                  aria-label="Close navigation menu"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <div className="flex flex-1 flex-col justify-between overflow-y-auto px-4 py-4">
                <NavigationGroups
                  groups={navGroups}
                  pathname={pathname}
                  expandedGroups={expandedGroups}
                  onToggle={toggleNavigationGroup}
                  onNavigate={() => setIsMobileNavOpen(false)}
                  ariaLabel="Mobile Navigation Links"
                />
                <div className="space-y-3 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileNavOpen(false);
                      toggleSidebar();
                    }}
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <span>Expand menu</span>
                    <span aria-hidden="true">›</span>
                  </button>
                  <Link
                    href="/account"
                    onClick={() => setIsMobileNavOpen(false)}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'w-full justify-start truncate px-2 text-xs text-muted-foreground'
                    )}
                  >
                    {session.user.email}
                  </Link>
                  <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
                    <Link
                      href="/manual"
                      onClick={() => setIsMobileNavOpen(false)}
                      className="text-[11px] hover:text-foreground hover:underline"
                    >
                      Help / Manual
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setIsMobileNavOpen(false)}
                      className="text-[11px] hover:text-foreground hover:underline"
                    >
                      Settings
                    </Link>
                    <Link
                      href="/logout"
                      onClick={() => setIsMobileNavOpen(false)}
                      className="text-[11px] hover:text-foreground hover:underline"
                    >
                      Log out
                    </Link>
                  </div>
                </div>
              </div>
            </aside>
          </>
        ) : null}

        {/* Page Content */}
        <div className="flex-1 pb-8">{children}</div>
      </div>
    </div>
  );
}
