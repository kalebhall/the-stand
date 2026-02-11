import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { auth } from '@/src/auth/auth';
import { getNavigationItems } from '@/src/auth/navigation';

type Session = Awaited<ReturnType<typeof auth>>;

export function AppNavigation({ session }: { session: Session }) {
  if (!session?.user?.id) {
    return null;
  }

  const navigationItems = getNavigationItems(session.user.roles);

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <nav className="flex flex-wrap items-center gap-2" aria-label="Primary">
          {navigationItems.map((item) => (
            <Link key={item.href} href={item.href} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{session.user.email}</span>
          <Link href="/logout" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Log out
          </Link>
        </div>
      </div>
    </header>
  );
}
