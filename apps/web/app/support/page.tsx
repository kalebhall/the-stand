import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

const sectionDefinitions = [
  {
    key: 'queue',
    href: '/support/queue',
    actionKey: 'openQueue'
  },
  {
    key: 'users',
    href: '/support/users',
    actionKey: 'manageUsers'
  },
  {
    key: 'provisioning',
    href: '/support/provisioning',
    actionKey: 'manageProvisioning'
  },
  {
    key: 'accessRequests',
    href: '/support/access-requests',
    actionKey: 'reviewRequests'
  },
  {
    key: 'auditLog',
    href: '/support/audit-log',
    actionKey: 'viewAuditLog'
  },
  {
    key: 'hymns',
    href: '/support/hymns',
    actionKey: 'manageHymns'
  },
  {
    key: 'health',
    href: '/settings/health',
    actionKey: 'viewHealth'
  }
] as const;

export default async function SupportConsolePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    redirect('/dashboard');
  }

  const t = await getTranslations('supportConsole');

  const queueCount = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM support_work_item
      WHERE status = 'UNASSIGNED'`
  );
  const unassignedCount = Number(queueCount.rows[0]?.count ?? 0);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
        <p className="text-sm font-medium">{t('unassignedWork', { count: unassignedCount })}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sectionDefinitions.map((section) => (
          <article key={section.href} className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
            <h2 className="text-lg font-semibold">{t(`sections.${section.key}.title`)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t(`sections.${section.key}.description`)}</p>
            <Link href={section.href} className={cn(buttonVariants({ className: 'mt-4', size: 'sm', variant: 'outline' }))}>
              {t(`actions.${section.actionKey}`)}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
