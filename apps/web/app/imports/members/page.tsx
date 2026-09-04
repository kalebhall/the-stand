import { redirect } from 'next/navigation';
import Link from 'next/link';

import { MemberImportClient } from './member-import-client';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports } from '@/src/auth/roles';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function ImportMembersPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Import Members</h1>
          <p className="text-sm text-muted-foreground">Import ward membership records from LCR into The Stand.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/members" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Manage Members
          </Link>
          <Link href="/imports/callings" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Import Callings →
          </Link>
        </div>
      </div>

      <MemberImportClient wardId={session.activeWardId} />
    </main>
  );
}
