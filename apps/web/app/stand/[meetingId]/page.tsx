import { notFound, redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { buildStandRows } from '@/src/stand/render';

type ProgramItemRow = {
  item_type: string;
  title: string | null;
  notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
};

type TemplateRow = {
  welcome_text: string;
  sustain_template: string;
  release_template: string;
};

export default async function StandViewPage({
  params,
  searchParams
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const { meetingId } = await params;
  const { mode } = await searchParams;
  const selectedMode = mode === 'compact' ? 'compact' : 'formal';

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingResult = await client.query('SELECT id FROM meeting WHERE id = $1 AND ward_id = $2 LIMIT 1', [meetingId, session.activeWardId]);

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      notFound();
    }

    const programResult = await client.query(
      `SELECT item_type, title, notes, hymn_number, hymn_title
         FROM meeting_program_item
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY sequence ASC`,
      [meetingId, session.activeWardId]
    );

    const templateResult = await client.query(
      'SELECT welcome_text, sustain_template, release_template FROM ward_stand_template WHERE ward_id = $1 LIMIT 1',
      [session.activeWardId]
    );

    await client.query('COMMIT');

    const template = templateResult.rows[0] as TemplateRow | undefined;
    const standRows = buildStandRows(programResult.rows as ProgramItemRow[], {
      welcomeText: template?.welcome_text,
      sustainTemplate: template?.sustain_template,
      releaseTemplate: template?.release_template
    });

    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 sm:p-4">
          <h1 className="text-xl font-semibold sm:text-2xl">At the Stand</h1>
          <div className="flex gap-2" role="tablist" aria-label="Stand view mode">
            <Button asChild variant={selectedMode === 'formal' ? 'default' : 'outline'} size="sm">
              <a href={`/stand/${meetingId}?mode=formal`}>Formal Script</a>
            </Button>
            <Button asChild variant={selectedMode === 'compact' ? 'default' : 'outline'} size="sm">
              <a href={`/stand/${meetingId}?mode=compact`}>Compact Labels</a>
            </Button>
          </div>
        </section>

        <section className="grid gap-3">
          {selectedMode === 'formal'
            ? standRows.map((row, index) => {
                if (row.kind === 'welcome') {
                  return (
                    <article key={`row-${index}`} className="rounded-lg border bg-card p-4 text-lg leading-relaxed sm:p-5 sm:text-xl">
                      {row.text}
                    </article>
                  );
                }

                if (row.kind === 'standard') {
                  return (
                    <article key={`row-${index}`} className="rounded-lg border bg-card p-4 sm:p-5">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">{row.label}</p>
                      <p className="text-lg font-medium sm:text-xl">{row.details}</p>
                    </article>
                  );
                }

                return (
                  <article key={`row-${index}`} className="rounded-lg border bg-card p-4 text-lg leading-relaxed sm:p-5 sm:text-xl">
                    {row.segments.map((segment, segmentIndex) =>
                      segment.bold ? <strong key={`segment-${segmentIndex}`}>{segment.text}</strong> : <span key={`segment-${segmentIndex}`}>{segment.text}</span>
                    )}
                  </article>
                );
              })
            : standRows.map((row, index) => {
                if (row.kind === 'welcome') {
                  return (
                    <article key={`compact-${index}`} className="rounded-lg border bg-card p-4 text-base sm:p-5 sm:text-lg">
                      {row.text}
                    </article>
                  );
                }

                if (row.kind === 'standard') {
                  return (
                    <article key={`compact-${index}`} className="rounded-lg border bg-card p-4 sm:p-5">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">{row.label}</p>
                      <p className="text-base font-medium sm:text-lg">{row.details}</p>
                    </article>
                  );
                }

                return (
                  <article key={`compact-${index}`} className="rounded-lg border bg-card p-4 sm:p-5">
                    <p className="text-sm uppercase tracking-wide text-muted-foreground">{row.kind === 'sustain' ? 'Sustain' : 'Release'}</p>
                    <p className="text-base font-medium sm:text-lg">{row.summary}</p>
                  </article>
                );
              })}
        </section>
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load stand view');
  } finally {
    client.release();
  }
}
