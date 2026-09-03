import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canUseInternalNotes } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { loadReportData } from '@/src/reports/aggregations';
import { REPORT_PAGES, ReportDateFilters, ReportView } from '@/components/reports/report-view';

function optionalDate(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export default async function ReportPage({
  params,
  searchParams
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const { report } = await params;
  const reportPage = REPORT_PAGES.find((item) => item.slug === report);
  if (!reportPage) notFound();
  const filters = await searchParams;
  const from = optionalDate(filters.from);
  const to = optionalDate(filters.to);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const data = await loadReportData(client, { wardId: session.activeWardId, from, to });
    await client.query('COMMIT');

    return (
      <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground">← All reports</Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{reportPage.title}</h1>
            <p className="text-sm text-muted-foreground">{reportPage.description}</p>
          </div>
        </section>
        <ReportDateFilters from={from} to={to} />
        <ReportView slug={report} data={data} />
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load report');
  } finally {
    client.release();
  }
}
