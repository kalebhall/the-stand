import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { MemberImportClient } from './member-import-client';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports } from '@/src/auth/roles';
import { isWardModuleEnabled } from '@/src/modules/service';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function ImportMembersPage() {
  const t = await getTranslations('imports');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'imports'))) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('members.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('members.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/members" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            {t('members.manage')}
          </Link>
          <Link href="/imports/callings" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            {t('members.next')}
          </Link>
        </div>
      </div>

      <MemberImportClient wardId={session.activeWardId} />
    </main>
  );
}
