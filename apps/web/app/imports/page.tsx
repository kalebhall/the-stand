import { redirect } from 'next/navigation';
import Link from 'next/link';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports } from '@/src/auth/roles';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function ImportsHubPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Imports & Sync</h1>
        <p className="text-sm text-muted-foreground">
          Import ward directory and calling records from LCR into The Stand using official file exports or the browser DOM extractor.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="section-panel section-panel--resource flex flex-col justify-between rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>👤</span> Import Members
            </h2>
            <p className="text-sm text-muted-foreground">
              Import the ward Member List from LCR (names, emails, phones, ages).
            </p>
          </div>
          <div className="pt-2 flex flex-wrap gap-2">
            <Link href="/imports/members" className={cn(buttonVariants({ size: 'sm' }))}>
              Open Member Importer →
            </Link>
            <Link href="/members" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              View Members & Notes
            </Link>
          </div>
        </section>

        <section className="section-panel section-panel--service flex flex-col justify-between rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>📋</span> Import Callings
            </h2>
            <p className="text-sm text-muted-foreground">
              Import the Members with Callings report from LCR (organizations, callings, sustain dates, set apart statuses).
            </p>
          </div>
          <div className="pt-2 flex flex-wrap gap-2">
            <Link href="/imports/callings" className={cn(buttonVariants({ size: 'sm' }))}>
              Open Callings Importer →
            </Link>
            <Link href="/callings" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              View Callings
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
