import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewProgramDesigner, hasRole } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { ProgramsClient, type ProgramMeeting } from './programs-client';

export default async function ProgramsPage() {
  const t = await getTranslations('programs');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (
    !isAdvancedDesignerFeatureEnabled() ||
    !session.activeWardId ||
    !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)
  )
    redirect('/dashboard');
  const programsEnabled = await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs');
  const readOnly = !programsEnabled && hasRole(session.user.roles, 'PROGRAM_EDITOR');
  if (!programsEnabled && !readOnly) redirect('/dashboard');

  const client = await pool.connect();
  let meetings: ProgramMeeting[] = [];
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const result = await client.query(
      `SELECT m.id, m.meeting_date, m.meeting_type, m.status,
              COUNT(mpi.id)::int AS program_item_count,
              COALESCE(
                array_agg(
                  COALESCE(
                    NULLIF(mpi.title, ''),
                    NULLIF(concat_ws(' ', NULLIF(mpi.hymn_number, ''), NULLIF(mpi.hymn_title, '')), ''),
                    initcap(replace(mpi.item_type, '_', ' '))
                  ) ORDER BY mpi.sequence, mpi.id
                ) FILTER (WHERE mpi.id IS NOT NULL),
                ARRAY[]::text[]
              ) AS program_items
         FROM meeting m LEFT JOIN meeting_program_item mpi ON mpi.meeting_id = m.id AND mpi.ward_id = m.ward_id
        WHERE m.ward_id = $1::uuid AND m.meeting_date >= CURRENT_DATE
        GROUP BY m.id ORDER BY m.meeting_date ASC LIMIT 20`,
      [session.activeWardId]
    );
    meetings = (result.rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      meetingDate: String(row.meeting_date),
      meetingType: String(row.meeting_type),
      status: String(row.status),
      programItemCount: Number(row.program_item_count ?? 0),
      programItems: Array.isArray(row.program_items) ? row.program_items.map((item) => String(item)) : []
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
          <h1 className="text-3xl font-semibold tracking-tight">{t(readOnly ? 'upcomingPrograms' : 'studioTitle')}</h1>
          {!readOnly ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('studioDescription')}</p> : null}
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <a href="/manual#programs" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              {t('help')}
            </a>
            <a href="/programs/templates" className={cn(buttonVariants({ variant: 'outline' }))}>
              {t('templates')}
            </a>
          </div>
        ) : null}
      </section>
      {!readOnly ? (
        <section aria-label={t('programTypes')} className="grid gap-4 sm:grid-cols-2">
          <a href="#sacrament-programs" className="rounded-lg border bg-card p-5 transition-colors hover:border-primary hover:bg-accent/30">
            <h2 className="text-lg font-semibold">{t('sacramentPrograms')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('sacramentProgramsDescription')}</p>
          </a>
          <Link
            href="/programs/baptism"
            className="rounded-lg border bg-card p-5 transition-colors hover:border-primary hover:bg-accent/30"
          >
            <h2 className="text-lg font-semibold">{t('baptismPrograms')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('baptismProgramsDescription')}</p>
          </Link>
        </section>
      ) : null}
      <h2 id="sacrament-programs" className="scroll-mt-6 text-xl font-semibold">
        {t('upcoming')}
      </h2>
      <ProgramsClient meetings={meetings} readOnly={readOnly} />
    </main>
  );
}
