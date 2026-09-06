import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

 type HealthState = 'HEALTHY' | 'DEGRADED' | 'NOT_CONFIGURED' | 'UNAVAILABLE';

type HealthCheck = {
  name: string;
  state: HealthState;
  detail: string;
};

function CheckCard({ check }: { check: HealthCheck }) {
  const tone = check.state === 'HEALTHY'
    ? 'border-green-500/40 bg-green-500/10'
    : check.state === 'DEGRADED'
      ? 'border-amber-500/40 bg-amber-500/10'
      : 'border-muted bg-muted/30';

  return (
    <article className={`rounded-lg border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-semibold">{check.name}</h2>
        <span className="rounded-full border px-2 py-0.5 text-xs font-medium" aria-label={`${check.name}: ${check.state}`}>
          {check.state.replaceAll('_', ' ')}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{check.detail}</p>
    </article>
  );
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await pool.query('SELECT 1');
    return { name: 'Database', state: 'HEALTHY', detail: 'Database connection and basic query succeeded.' };
  } catch {
    return { name: 'Database', state: 'UNAVAILABLE', detail: 'Database check failed. No query details are shown.' };
  }
}

async function checkQueue(): Promise<HealthCheck> {
  if (!process.env.REDIS_URL) {
    return { name: 'Notification queue', state: 'NOT_CONFIGURED', detail: 'REDIS_URL is not configured; queue uses its local default only when explicitly started.' };
  }

  let closeQueue: (() => Promise<void>) | undefined;
  try {
    const { Queue } = await import('bullmq');
    const queue = new Queue('notification-outbox', { connection: { url: process.env.REDIS_URL } });
    closeQueue = () => queue.close();
    const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed');
    const failed = counts.failed ?? 0;
    const detail = `${counts.waiting ?? 0} waiting, ${counts.active ?? 0} active, ${counts.delayed ?? 0} delayed, ${failed} failed. Redis reachable; worker liveness requires deployment service monitoring.`;
    return { name: 'Notification queue', state: failed > 0 ? 'DEGRADED' : 'HEALTHY', detail };
  } catch {
    return { name: 'Notification queue', state: 'UNAVAILABLE', detail: 'Redis queue check failed. No connection details are shown.' };
  } finally {
    await closeQueue?.().catch(() => undefined);
  }
}

async function checkBackups(): Promise<HealthCheck> {
  const backupDirectory = process.env.BACKUP_DIR?.trim();
  if (!backupDirectory) {
    return { name: 'Backups', state: 'NOT_CONFIGURED', detail: 'BACKUP_DIR is not configured for this application process.' };
  }

  try {
    await access(backupDirectory);
    const files = await readdir(backupDirectory);
    const backups = await Promise.all(files.filter((file) => file.endsWith('.sql.gz')).map(async (file) => ({ file, modified: (await stat(path.join(backupDirectory, file))).mtimeMs })));
    const latest = backups.sort((a, b) => b.modified - a.modified)[0];
    return latest
      ? { name: 'Backups', state: 'HEALTHY', detail: `Backup directory reachable; latest SQL backup is ${latest.file}. Restore verification remains a separate operation.` }
      : { name: 'Backups', state: 'DEGRADED', detail: 'Backup directory reachable, but no SQL backup files were found.' };
  } catch {
    return { name: 'Backups', state: 'UNAVAILABLE', detail: 'Backup directory could not be read. No path details are shown.' };
  }
}

async function checkPurge(): Promise<HealthCheck> {
  try {
    const result = await pool.query("SELECT COUNT(*)::int AS count FROM import_run WHERE raw_text <> '[purged]'");
    const remaining = Number(result.rows[0]?.count ?? 0);
    return remaining === 0
      ? { name: 'Raw-import purge', state: 'HEALTHY', detail: 'No unpurged raw import payloads found.' }
      : { name: 'Raw-import purge', state: 'DEGRADED', detail: `${remaining} raw import payload(s) remain unpurged; review retention job status.` };
  } catch {
    return { name: 'Raw-import purge', state: 'UNAVAILABLE', detail: 'Purge status could not be queried.' };
  }
}

async function checkNotifications(): Promise<HealthCheck> {
  try {
    const result = await pool.query("SELECT COUNT(*) FILTER (WHERE delivery_status = 'failure')::int AS failures, MAX(attempted_at) AS last_attempt FROM notification_delivery");
    const row = result.rows[0] as { failures?: number; last_attempt?: string | null } | undefined;
    const failures = Number(row?.failures ?? 0);
    const lastAttempt = row?.last_attempt ? new Date(row.last_attempt).toISOString() : 'none recorded';
    return { name: 'Notification worker', state: failures > 0 ? 'DEGRADED' : 'HEALTHY', detail: `${failures} recorded delivery failures; last delivery attempt: ${lastAttempt}. Worker process liveness is monitored outside this page.` };
  } catch {
    return { name: 'Notification worker', state: 'UNAVAILABLE', detail: 'Notification delivery status could not be queried.' };
  }
}

export default async function HealthPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN') && !hasRole(session.user.roles, 'SYSTEM_ADMIN')) {
    redirect('/dashboard');
  }

  const checks = await Promise.all([checkDatabase(), checkQueue(), checkBackups(), checkPurge(), checkNotifications()]);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6" aria-labelledby="health-heading">
      <header>
        <h1 id="health-heading" className="text-2xl font-semibold tracking-tight">Deployment health</h1>
        <p className="mt-1 text-sm text-muted-foreground">Operational checks for authorized administrators. Secrets, connection strings, and private payloads are never displayed.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-2" aria-label="Deployment health checks">
        {checks.map((check) => <CheckCard key={check.name} check={check} />)}
      </section>
      <p className="text-sm text-muted-foreground">Backup restore, worker process liveness, and purge scheduling still require deployment-level monitoring and drills.</p>
    </main>
  );
}
