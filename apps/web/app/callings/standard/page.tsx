import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StandardCallingsManager, type StandardCalling } from '@/components/StandardCallingsManager';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageCallings, canViewCallings, hasRole } from '@/src/auth/roles';
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
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (
    !session.activeWardId ||
    !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)
  ) {
    redirect('/dashboard');
  }

  const wardId = session.activeWardId;
  const canManage =
    canManageCallings({ roles: session.user.roles, activeWardId: wardId }, wardId) ||
    hasRole(session.user.roles, 'SUPPORT_ADMIN');

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
            Callings
          </Link>
          <span>/</span>
          <span>Standard Callings</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Standard Callings</h1>
        <p className="text-sm text-muted-foreground">
          The reference list of calling titles used for autocomplete suggestions when adding a calling assignment.
          Includes ward, stake, branch, and district callings.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <StandardCallingsManager callings={callings} canManage={canManage} />
      </section>
    </main>
  );
}
