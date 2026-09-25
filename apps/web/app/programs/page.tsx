import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { ProgramsClient, type ProgramMeeting } from './programs-client';

export default async function ProgramsPage() {
  const t = await getTranslations('programs');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!isAdvancedDesignerFeatureEnabled() || !session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')) || !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard');

  const client = await pool.connect();
  let meetings: ProgramMeeting[] = [];
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const result = await client.query(
      `SELECT m.id, m.meeting_date, m.meeting_type, m.status, COUNT(mpi.id)::int AS program_item_count
         FROM meeting m LEFT JOIN meeting_program_item mpi ON mpi.meeting_id = m.id
        WHERE m.ward_id = $1::uuid AND m.meeting_date >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY m.id ORDER BY m.meeting_date ASC LIMIT 20`,
      [session.activeWardId]
    );
    meetings = (result.rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      meetingDate: String(row.meeting_date),
      meetingType: String(row.meeting_type),
      status: String(row.status),
      programItemCount: Number(row.program_item_count ?? 0)
    }));
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
  } finally {
    client.release();
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t('designer')}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t('upcoming')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <a href="/programs/templates" className={cn(buttonVariants({ variant: 'outline' }))}>{t('templates')}</a>
      </section>
      <ProgramsClient meetings={meetings} />
    </main>
  );
}
