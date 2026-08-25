import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';
import { enforcePasswordRotation } from '@/src/auth/guards';
import { canRunImports } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { WardAuditLogClient, type AuditLogItem } from './WardAuditLogClient';

const DEFAULT_PAGE_SIZE = 50;

export default async function WardAuditLogPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  enforcePasswordRotation(session);

  if (
    !session.activeWardId ||
    !canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)
  ) {
    redirect('/dashboard');
  }

  const wardId = session.activeWardId;
  const client = await pool.connect();

  let items: AuditLogItem[] = [];
  let total = 0;
  let distinctActions: string[] = [];

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const [dataResult, countResult, actionsResult] = await Promise.all([
      client.query(
        `SELECT al.id,
                al.user_id,
                al.action,
                al.details,
                al.created_at,
                ua.email AS user_email,
                ua.display_name AS user_display_name
           FROM audit_log al
           LEFT JOIN user_account ua ON ua.id = al.user_id
          WHERE al.ward_id = $1
          ORDER BY al.created_at DESC
          LIMIT $2 OFFSET 0`,
        [wardId, DEFAULT_PAGE_SIZE]
      ),
      client.query('SELECT COUNT(*) AS total FROM audit_log WHERE ward_id = $1', [wardId]),
      client.query('SELECT DISTINCT action FROM audit_log WHERE ward_id = $1 ORDER BY action ASC', [wardId])
    ]);

    await client.query('COMMIT');

    total = parseInt(String(countResult.rows[0]?.total ?? '0'), 10);
    distinctActions = (actionsResult.rows as { action: string }[]).map((r) => r.action);
    items = (dataResult.rows as {
      id: string;
      user_id: string | null;
      action: string;
      details: Record<string, unknown> | null;
      created_at: string;
      user_email: string | null;
      user_display_name: string | null;
    }[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      details: row.details,
      createdAt: row.created_at,
      userEmail: row.user_email,
      userDisplayName: row.user_display_name
    }));
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load activity log');
  } finally {
    client.release();
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <div>
          <Link href="/settings" className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }))}>
            &larr; Settings
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          Track all changes made in your ward — meetings, callings, members, announcements, and user access.
        </p>
      </section>

      <WardAuditLogClient
        initialItems={items}
        initialTotal={total}
        initialPage={1}
        initialPageSize={DEFAULT_PAGE_SIZE}
        initialTotalPages={Math.ceil(total / DEFAULT_PAGE_SIZE)}
        initialDistinctActions={distinctActions}
        wardId={wardId}
      />
    </main>
  );
}
