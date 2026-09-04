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
                al.actor_name,
                al.actor_role,
                al.action,
                al.target_member_id,
                al.target_member_name,
                al.entity_type,
                al.entity_id,
                al.changes,
                al.previous_state,
                al.details,
                al.source,
                al.severity,
                al.is_cross_ward_support,
                al.calling_name,
                al.organization,
                al.calling_status,
                al.meeting_date,
                al.item_type,
                al.item_title,
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

    await client.query('COMMIT');

    total = parseInt(String(countResult.rows[0]?.total ?? '0'), 10);
    distinctActions = (actionsResult.rows as { action: string }[]).map((r) => r.action);
    items = (
      dataResult.rows as {
        id: string;
        ward_id: string | null;
        user_id: string | null;
        actor_name: string | null;
        actor_role: string | null;
        action: string;
        target_member_id: string | null;
        target_member_name: string | null;
        entity_type: string | null;
        entity_id: string | null;
        changes: Record<string, { old: unknown; new: unknown }> | null;
        previous_state: Record<string, unknown> | null;
        details: Record<string, unknown> | null;
        source: string | null;
        severity: string | null;
        is_cross_ward_support: boolean | null;
        calling_name: string | null;
        organization: string | null;
        calling_status: string | null;
        meeting_date: string | null;
        item_type: string | null;
        item_title: string | null;
        created_at: string;
        user_email: string | null;
        user_display_name: string | null;
        ward_name: string | null;
      }[]
    ).map((row) => ({
      id: row.id,
      wardId: row.ward_id,
      userId: row.user_id,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      action: row.action,
      targetMemberId: row.target_member_id,
      targetMemberName: row.target_member_name,
      entityType: row.entity_type,
      entityId: row.entity_id,
      changes: row.changes,
      previousState: row.previous_state,
      details: row.details,
      source: row.source,
      severity: row.severity,
      isCrossWardSupport: Boolean(row.is_cross_ward_support),
      callingName: row.calling_name,
      organization: row.organization,
      callingStatus: row.calling_status,
      meetingDate: row.meeting_date,
      itemType: row.item_type,
      itemTitle: row.item_title,
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
