import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { hasRole } from '@/src/auth/roles';

export default async function DashboardPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  const canViewSupportConsole = hasRole(session.user.roles, 'SUPPORT_ADMIN');

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">Authenticated as {session.user.email}</p>
      {canViewSupportConsole ? (
        <Link className={cn(buttonVariants({ variant: 'outline' }))} href="/support/access-requests">
          Open Support Console
        </Link>
      ) : null}
    </main>
  );
}
