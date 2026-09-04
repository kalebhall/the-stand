import Link from 'next/link';
import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports } from '@/src/auth/roles';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SacramentPlannerImportClient } from './sacrament-planner-import-client';

export default async function SacramentPlannerImportPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard');

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Import Historical Programs</h1>
          <p className="text-sm text-muted-foreground">Bring completed meetings from the Freedom Park Sacrament Planner into The Stand for reporting.</p>
        </div>
        <Link href="/imports" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>← Imports</Link>
      </div>
      <SacramentPlannerImportClient wardId={session.activeWardId} />
    </main>
  );
}
