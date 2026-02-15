import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

import StakeWardManager from './StakeWardManager';
import type { StakeRow, WardRow } from './StakeWardManager';

export default async function SupportProvisioningPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    redirect('/dashboard');
  }

  const stakesResult = await pool.query(`SELECT id, name, created_at FROM stake ORDER BY name ASC`);
  const wardsResult = await pool.query(
    `SELECT w.id, w.stake_id, w.name, w.unit_number, s.name AS stake_name, w.created_at
       FROM ward w
       JOIN stake s ON s.id = w.stake_id
      ORDER BY s.name ASC, w.name ASC`
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_PROVISIONING_VIEWED', jsonb_build_object('stakeCount', $2::int, 'wardCount', $3::int))`,
    [session.user.id, stakesResult.rowCount ?? 0, wardsResult.rowCount ?? 0]
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <Link href="/support" className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }))}>
            &larr; Support Console
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Stake & Ward Provisioning</h1>
        <p className="text-muted-foreground">
          Create and manage stakes and wards. Wards are assigned to a parent stake.
        </p>
      </section>

      <StakeWardManager
        stakes={stakesResult.rows as StakeRow[]}
        wards={wardsResult.rows as WardRow[]}
      />
    </main>
  );
}
