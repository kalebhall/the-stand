import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

import AuditLogViewer from './AuditLogViewer';
import type { AuditLogEntry } from './AuditLogViewer';

const DEFAULT_PAGE_SIZE = 50;

export default async function SupportAuditLogPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    redirect('/dashboard');
  }

  const client = await pool.connect();

  let items: AuditLogEntry[] = [];
  let total = 0;
  let distinctActions: string[] = [];

  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', session.user.id]);
    await client.query('SELECT set_config($1, $2, true)', ['app.ward_id', '']);

    const [dataResult, countResult, actionsResult] = await Promise.all([
      client.query(
        `SELECT al.id,
                al.ward_id,
                al.user_id,
                al.action,
                al.details,
                al.created_at,
                ua.email AS user_email,
                ua.display_name AS user_display_name,
                w.name AS ward_name
           FROM audit_log al
           LEFT JOIN user_account ua ON ua.id = al.user_id
           LEFT JOIN ward w ON w.id = al.ward_id
          ORDER BY al.created_at DESC
          LIMIT $1 OFFSET 0`,
        [DEFAULT_PAGE_SIZE]
      ),
      client.query('SELECT COUNT(*) AS total FROM audit_log'),
      client.query('SELECT DISTINCT action FROM audit_log ORDER BY action ASC')
    ]);

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_AUDIT_LOG_VIEWED', jsonb_build_object('count', $2::int))`,
      [session.user.id, countResult.rows[0]?.total ?? 0]
    );

    await client.query('COMMIT');

    total = parseInt(String(countResult.rows[0]?.total ?? '0'), 10);
    distinctActions = (actionsResult.rows as { action: string }[]).map((r) => r.action);
    items = (dataResult.rows as {
      id: string;
      ward_id: string | null;
      user_id: string | null;
      action: string;
      details: Record<string, unknown> | null;
      created_at: string;
      user_email: string | null;
      user_display_name: string | null;
      ward_name: string | null;
    }[]).map((row) => ({
      id: row.id,
      wardId: row.ward_id,
      userId: row.user_id,
      action: row.action,
      details: row.details,
      createdAt: row.created_at,
      userEmail: row.user_email,
      userDisplayName: row.user_display_name,
      wardName: row.ward_name
    }));
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load audit log data');
  } finally {
    client.release();
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <Link href="/support" className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }))}>
            &larr; Support Console
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          Review all system activity across wards. Filter by action type, user, date range, or search across all fields.
        </p>
      </section>

      <AuditLogViewer
        initialItems={items}
        initialTotal={total}
        initialPage={1}
        initialPageSize={DEFAULT_PAGE_SIZE}
        initialTotalPages={Math.ceil(total / DEFAULT_PAGE_SIZE)}
        distinctActions={distinctActions}
      />
    </main>
  );
}
