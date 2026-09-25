import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { StandardCallingsManager, type StandardCalling } from '@/components/StandardCallingsManager';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings, hasRole } from '@/src/auth/roles';
import { isWardModuleEnabled } from '@/src/modules/service';
import { pool } from '@/src/db/client';

type StandardCallingRow = {
  id: string;
  name: string;
  organization: string | null;
  unit_type: string;
  sort_order: number;
  is_active: boolean;
};

export default async function StandardCallingsPage() {
  const t = await getTranslations('callings');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  const isGlobalCatalogAdmin = hasRole(session.user.roles, 'SUPPORT_ADMIN') || hasRole(session.user.roles, 'SYSTEM_ADMIN');
  if ((!isGlobalCatalogAdmin && (!session.activeWardId || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId))) || (session.activeWardId && !isGlobalCatalogAdmin && !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'callings')))) {
    redirect('/dashboard');
  }

  const canManage = isGlobalCatalogAdmin;

  let callings: StandardCalling[] = [];

  try {
    const result = await pool.query(
      `SELECT id, name, organization, unit_type, sort_order, is_active
         FROM standard_calling
        ORDER BY unit_type, sort_order, name`
    );

    callings = (result.rows as StandardCallingRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      organization: row.organization,
      unitType: row.unit_type as StandardCalling['unitType'],
      sortOrder: row.sort_order,
      isActive: row.is_active
    }));
  } catch {
    // Table may not exist yet if migrations haven't been run; show empty state
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/callings" className="hover:underline">
            {t('title')}
          </Link>
          <span>/</span>
          <span>{t('standardCallings')}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('standardCallings')}</h1>
        <p className="text-sm text-muted-foreground">{t('standardCallingsDescription')}</p>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <StandardCallingsManager callings={callings} canManage={canManage} />
      </section>
    </main>
  );
}
