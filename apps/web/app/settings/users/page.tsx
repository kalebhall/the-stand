import { redirect } from 'next/navigation';

import { requireAuthenticatedSession } from '@/src/auth/guards';
import { hasRole } from '@/src/auth/roles';

import { WardUsersManager } from './ward-users-manager';

export default async function SettingsUsersPage() {
  const session = await requireAuthenticatedSession();

  if (!hasRole(session.user.roles, 'STAND_ADMIN')) {
    redirect('/dashboard');
  }

  if (!session.activeWardId) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Ward User Management</h1>
        <p className="text-sm text-muted-foreground">
          Assign or revoke ward roles. STAND_ADMIN assignment is restricted to Support Admin.
        </p>
      </div>
      <WardUsersManager wardId={session.activeWardId} />
    </main>
  );
}
