import Link from 'next/link';
import { redirect } from 'next/navigation';

import { requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports, hasRole } from '@/src/auth/roles';

import { WardUsersManager } from './ward-users-manager';

export default async function SettingsUsersPage() {
  const session = await requireAuthenticatedSession();

  if (!hasRole(session.user.roles, 'STAND_ADMIN')) {
    redirect('/dashboard');
  }

  if (!session.activeWardId) {
    redirect('/dashboard');
  }

  const canViewActivityLog = canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Ward User Management</h1>
        <p className="text-sm text-muted-foreground">Assign or revoke ward roles. STAND_ADMIN assignment is restricted to Support Admin.</p>
      </div>
      {canViewActivityLog ? (
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <h2 className="text-sm font-semibold">Activity Log</h2>
          <p className="text-xs text-muted-foreground">See all changes made in your ward.</p>
          <Link href="/settings/audit-log" className="text-sm underline underline-offset-2 hover:text-foreground text-muted-foreground">
            View Activity Log &rarr;
          </Link>
        </div>
      ) : null}
      <WardUsersManager wardId={session.activeWardId} />
    </main>
  );
}
