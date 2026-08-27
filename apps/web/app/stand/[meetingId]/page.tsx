import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { WardBusinessSection, type BusinessLine } from '@/components/WardBusinessSection';
import { InternalNotesPanel, type InternalNoteRow } from '@/components/InternalNotesPanel';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageCallings, canUseInternalNotes, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isAnnouncementActiveForDate } from '@/src/announcements/types';
import { buildStandRows } from '@/src/stand/render';

type ProgramItemRow = {
  id: string;
  item_type: string;
  title: string | null;
  notes: string | null;
  program_notes: string | null;
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

  const activeWardId = session.activeWardId;

  const { meetingId } = await params;
  const { mode } = await searchParams;
  const selectedMode = mode === 'compact' ? 'compact' : 'formal';

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingResult = await client.query('SELECT id, meeting_date FROM meeting WHERE id = $1 AND ward_id = $2 LIMIT 1', [meetingId, session.activeWardId]);

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      notFound();
    }

    const meetingDate = meetingResult.rows[0].meeting_date as string;

    const programResult = await client.query(
      `SELECT id, item_type, title, notes, program_notes, hymn_number, hymn_title
         FROM meeting_program_item
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY sequence ASC`,
      [meetingId, session.activeWardId]
    );

    const templateResult = await client.query(
      'SELECT welcome_text, sustain_template, release_template FROM ward_stand_template WHERE ward_id = $1 LIMIT 1',
      [session.activeWardId]
    );

    const announcementResult = await client.query(
      `SELECT title, body, start_date, end_date, is_permanent, include_in_stand
         FROM announcement
        WHERE ward_id = $1
          AND include_in_stand = TRUE`,
      [session.activeWardId]
    );

    const businessLinesResult = await client.query(
      `SELECT id, member_name, calling_name, action_type, status
         FROM meeting_business_line
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
        ORDER BY created_at ASC`,
      [meetingId, session.activeWardId]
    );

    const notesResult = await client.query(
      `SELECT note.id, note.program_item_id, note.visibility, note.note_text, note.created_at, ua.email AS created_by_email
         FROM internal_note note
         LEFT JOIN user_account ua ON ua.id = note.created_by_user_id
        WHERE note.ward_id = $1::uuid
          AND note.meeting_id IS NULL
          AND note.program_item_id IN (
            SELECT id FROM meeting_program_item WHERE meeting_id = $2::uuid AND ward_id = $1::uuid
          )
          AND (note.visibility = 'LEADERSHIP' OR note.created_by_user_id = $3::uuid)
        ORDER BY note.created_at DESC`,
      [session.activeWardId, meetingId, session.user.id]
    );

    await client.query('COMMIT');

    const activeStandAnnouncements = (announcementResult.rows as Array<{
      title: string;
      body: string | null;
      start_date: string | null;
      end_date: string | null;
      is_permanent: boolean;
      include_in_stand: boolean;
    }>)
      .filter((a) =>
        isAnnouncementActiveForDate(
          {
            startDate: a.start_date,
            endDate: a.end_date,
            isPermanent: a.is_permanent
          },
          meetingDate
        )
      )
      .map((a) => ({
        title: a.title,
        body: a.body,
        includeInStand: a.include_in_stand
      }));

    const template = templateResult.rows[0] as TemplateRow | undefined;
    const businessLines = businessLinesResult.rows as BusinessLine[];
    const notes = notesResult.rows as Array<InternalNoteRow & { program_item_id: string }>;
    const canUseNotes = canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);
    const canManage = canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);
    const standRows = buildStandRows(
      (programResult.rows as ProgramItemRow[]).map((item) => ({
        id: item.id,
        itemType: item.item_type,
        title: item.title,
        notes: item.notes,
        programNotes: item.program_notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title
      })),
      {
        welcomeText: template?.welcome_text,
        sustainTemplate: template?.sustain_template,
        releaseTemplate: template?.release_template
      },
      activeStandAnnouncements
    );

    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 sm:p-4">
          <h1 className="text-xl font-semibold sm:text-2xl">At the Stand</h1>
          <div className="flex gap-2" role="tablist" aria-label="Stand view mode">
            <Link
              href={`/stand/${meetingId}?mode=formal`}
              className={cn(buttonVariants({ variant: selectedMode === 'formal' ? 'default' : 'outline', size: 'sm' }))}
            >
              Formal Script
            </Link>
            <Link
              href={`/stand/${meetingId}?mode=compact`}
              className={cn(buttonVariants({ variant: selectedMode === 'compact' ? 'default' : 'outline', size: 'sm' }))}
            >
              Compact Labels
            </Link>
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
                      {row.programNotes?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p> : null}
                      {canUseNotes && row.programItemId ? (
                        <div className="mt-3">
                          <InternalNotesPanel
                            wardId={activeWardId}
                            target={{ type: 'PROGRAM_ITEM', programItemId: row.programItemId }}
                            notes={notes.filter((note) => note.program_item_id === row.programItemId)}
                            title="Item notes"
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                }

                if (row.kind === 'ward_business') {
                  return (
                    <WardBusinessSection
                      key={`row-${index}`}
                      wardId={activeWardId}
                      meetingId={meetingId}
                      lines={businessLines}
                      canManage={canManage}
                      showAnnounce={true}
                      showScript={true}
                      programNotes={row.programNotes}
                      sustainTemplate={template?.sustain_template ?? undefined}
                      releaseTemplate={template?.release_template ?? undefined}
                    />
                  );
                }

                return (
                  <article key={`row-${index}`} className="rounded-lg border bg-card p-4 text-lg leading-relaxed sm:p-5 sm:text-xl">
                    {row.segments.map((segment, segmentIndex) =>
                      segment.bold ? <strong key={`segment-${segmentIndex}`}>{segment.text}</strong> : <span key={`segment-${segmentIndex}`}>{segment.text}</span>
                    )}
                      {row.programNotes?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p> : null}
                    {canUseNotes ? (
                      <div className="mt-3">
                        <InternalNotesPanel
                          wardId={activeWardId}
                          target={{ type: 'PROGRAM_ITEM', programItemId: row.programItemId }}
                          notes={notes.filter((note) => note.program_item_id === row.programItemId)}
                          title="Item notes"
                        />
                      </div>
                    ) : null}
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
                      {row.programNotes?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p> : null}
                      {canUseNotes && row.programItemId ? (
                        <div className="mt-3">
                          <InternalNotesPanel
                            wardId={activeWardId}
                            target={{ type: 'PROGRAM_ITEM', programItemId: row.programItemId }}
                            notes={notes.filter((note) => note.program_item_id === row.programItemId)}
                            title="Item notes"
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                }

                if (row.kind === 'ward_business') {
                  return (
                    <WardBusinessSection
                      key={`compact-${index}`}
                      wardId={activeWardId}
                      meetingId={meetingId}
                      lines={businessLines}
                      canManage={canManage}
                      showAnnounce={true}
                      showScript={false}
                      programNotes={row.programNotes}
                      sustainTemplate={template?.sustain_template ?? undefined}
                      releaseTemplate={template?.release_template ?? undefined}
                    />
                  );
                }

                return (
                  <article key={`compact-${index}`} className="rounded-lg border bg-card p-4 sm:p-5">
                    <p className="text-sm uppercase tracking-wide text-muted-foreground">{row.kind === 'sustain' ? 'Sustain' : 'Release'}</p>
                    <p className="text-base font-medium sm:text-lg">{row.summary}</p>
                    {row.programNotes?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p> : null}
                    {canUseNotes ? (
                      <div className="mt-3">
                        <InternalNotesPanel
                          wardId={activeWardId}
                          target={{ type: 'PROGRAM_ITEM', programItemId: row.programItemId }}
                          notes={notes.filter((note) => note.program_item_id === row.programItemId)}
                          title="Item notes"
                        />
                      </div>
                    ) : null}
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
