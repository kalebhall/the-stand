import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { WardBusinessSection, type BusinessLine } from '@/components/WardBusinessSection';
import { MembershipOrdinanceSection, type MembershipOrdinanceAction } from '@/components/MembershipOrdinanceSection';
import { InternalNotesPanel, type InternalNoteRow } from '@/components/InternalNotesPanel';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageCallings, canUseInternalNotes, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isAnnouncementActiveForDate } from '@/src/announcements/types';
import { buildStandRows } from '@/src/stand/render';
import { formatAtStandMemberName } from '@/src/stand/member-display';
import { OfflineStandButton } from '@/components/offline-stand-button';
import type { IntroductionRoles } from '@/src/meetings/types';

type ProgramItemRow = {
  id: string;
  item_type: string;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  notes: string | null;
  topic: string | null;
  program_notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
  introduction_roles: IntroductionRoles | null;
};

type TemplateRow = {
  welcome_text: string;
  sustain_template: string;
  release_template: string;
  welcome_new_member_template: string;
  baby_blessing_template: string;
  priesthood_ordination_template: string;
  priesthood_advancement_template: string;
};

const SACRAMENT_SCRIPTURE_URL = 'https://www.churchofjesuschrist.org/study/scriptures/dc-testament/dc/20?lang=eng#p77';

function SacramentPrayers({ compact, programNotes }: { compact: boolean; programNotes?: string | null }) {
  return (
    <article className="rounded-lg border bg-card p-4 sm:p-5">
      <p className="text-sm uppercase tracking-wide text-muted-foreground">Sacrament</p>
      <div className={cn('mt-3 space-y-4', compact ? 'text-sm sm:text-base' : 'text-base leading-relaxed sm:text-lg')}>
        <section>
          <h2 className="font-semibold">Bread prayer</h2>
          <p className="mt-1">
            O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this bread to the souls of
            all those who partake of it, that they may eat in remembrance of the body of thy Son, and witness unto thee, O God, the Eternal
            Father, that they are willing to take upon them the name of thy Son, and always remember him and keep his commandments which he
            has given them; that they may always have his Spirit to be with them. Amen.
          </p>
        </section>
        <section>
          <h2 className="font-semibold">Water prayer</h2>
          <p className="mt-1">
            O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this water to the souls of
            all those who drink of it, that they may do it in remembrance of the blood of thy Son, which was shed for them; that they may
            witness unto thee, O God, the Eternal Father, that they do always remember him, that they may have his Spirit to be with them.
            Amen.
          </p>
        </section>
      </div>
      {programNotes?.trim() ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{programNotes}</p> : null}
      <a
        className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
        href={SACRAMENT_SCRIPTURE_URL}
        target="_blank"
        rel="noreferrer"
      >
        Doctrine and Covenants 20:77, 79
      </a>
    </article>
  );
}

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

    const meetingResult = await client.query('SELECT id, meeting_date FROM meeting WHERE id = $1 AND ward_id = $2 LIMIT 1', [
      meetingId,
      session.activeWardId
    ]);

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      notFound();
    }

    const meetingDate = meetingResult.rows[0].meeting_date as string;

    const programResult = await client.query(
      `SELECT i.id, i.item_type, i.title, i.notes, i.topic, i.program_notes, i.hymn_number, i.hymn_title, i.introduction_roles,
              m.first_name, m.last_name, m.gender
         FROM meeting_program_item i
         LEFT JOIN member m ON m.ward_id = i.ward_id AND m.full_name = i.title AND m.archived_at IS NULL
        WHERE i.meeting_id = $1::uuid AND i.ward_id = $2::uuid
        ORDER BY i.sequence ASC`,
      [meetingId, session.activeWardId]
    );

    const templateResult = await client.query(
      'SELECT welcome_text, sustain_template, release_template, welcome_new_member_template, baby_blessing_template, priesthood_ordination_template, priesthood_advancement_template FROM ward_stand_template WHERE ward_id = $1 LIMIT 1',
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
      `SELECT b.id, b.member_name, b.calling_name, b.action_type, b.status,
              m.first_name, m.last_name, m.gender
         FROM meeting_business_line b
         LEFT JOIN member m ON m.ward_id = b.ward_id AND m.full_name = b.member_name AND m.archived_at IS NULL
        WHERE b.meeting_id = $1::uuid AND b.ward_id = $2::uuid
        ORDER BY b.created_at ASC`,
      [meetingId, session.activeWardId]
    );

    const membershipActionsResult = await client.query(
      `SELECT id, member_name, action_type, priesthood_office, reason, details, status, approval_confirmed, presenting_leader, performing_priesthood_holder, ordinance_date
         FROM meeting_membership_ordinance
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
          AND (note.visibility IN ('LEADERSHIP', 'PUBLIC') OR note.created_by_user_id = $3::uuid)
        ORDER BY note.created_at DESC`,
      [session.activeWardId, meetingId, session.user.id]
    );

    await client.query('COMMIT');

    const activeStandAnnouncements = (
      announcementResult.rows as Array<{
        title: string;
        body: string | null;
        start_date: string | null;
        end_date: string | null;
        is_permanent: boolean;
        include_in_stand: boolean;
      }>
    )
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
    const businessLines = (
      businessLinesResult.rows as Array<
        BusinessLine & {
          first_name: string | null;
          last_name: string | null;
          gender: string | null;
        }
      >
    ).map((line) => ({
      ...line,
      member_name: formatAtStandMemberName(
        line.member_name,
        {
          firstName: line.first_name,
          lastName: line.last_name,
          gender: line.gender
        },
        line.calling_name
      )
    }));
    const membershipActions = membershipActionsResult.rows as MembershipOrdinanceAction[];
    const notes = notesResult.rows as Array<InternalNoteRow & { program_item_id: string }>;
    const canUseNotes = canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);
    const canManage = canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);
    const standRows = buildStandRows(
      (programResult.rows as ProgramItemRow[]).map((item) => ({
        id: item.id,
        itemType: item.item_type,
        title: item.title,
        member: { firstName: item.first_name, lastName: item.last_name, gender: item.gender },
        notes: item.notes,
        topic: item.topic,
        programNotes: item.program_notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title,
        introductionRoles: item.introduction_roles
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
          <OfflineStandButton userId={session.user.id} wardId={activeWardId} meetingId={meetingId} />
        </section>

        <MembershipOrdinanceSection
          wardId={activeWardId}
          meetingId={meetingId}
          actions={membershipActions}
          canManage={canManage}
          templates={{
            WELCOME_NEW_MEMBER: template?.welcome_new_member_template,
            BABY_BLESSING: template?.baby_blessing_template,
            PRIESTHOOD_ORDINATION: template?.priesthood_ordination_template,
            PRIESTHOOD_ADVANCEMENT: template?.priesthood_advancement_template
          }}
        />

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
                      <p className="whitespace-pre-wrap text-lg font-medium sm:text-xl">{row.details}</p>
                      {row.programNotes?.trim() ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p>
                      ) : null}
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

                if (row.kind === 'sacrament') {
                  return <SacramentPrayers key={`row-${index}`} programNotes={row.programNotes} compact={false} />;
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
                      collapsible={true}
                      programNotes={row.programNotes}
                      sustainTemplate={template?.sustain_template ?? undefined}
                      releaseTemplate={template?.release_template ?? undefined}
                    />
                  );
                }

                return (
                  <article key={`row-${index}`} className="rounded-lg border bg-card p-4 text-lg leading-relaxed sm:p-5 sm:text-xl">
                    {row.segments.map((segment, segmentIndex) =>
                      segment.bold ? (
                        <strong key={`segment-${segmentIndex}`}>{segment.text}</strong>
                      ) : (
                        <span key={`segment-${segmentIndex}`}>{segment.text}</span>
                      )
                    )}
                    {row.programNotes?.trim() ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p>
                    ) : null}
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
                      <p className="whitespace-pre-wrap text-base font-medium sm:text-lg">{row.details}</p>
                      {row.programNotes?.trim() ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p>
                      ) : null}
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

                if (row.kind === 'sacrament') {
                  return <SacramentPrayers key={`compact-${index}`} programNotes={row.programNotes} compact={true} />;
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
                      collapsible={true}
                      programNotes={row.programNotes}
                      sustainTemplate={template?.sustain_template ?? undefined}
                      releaseTemplate={template?.release_template ?? undefined}
                    />
                  );
                }

                return (
                  <article key={`compact-${index}`} className="rounded-lg border bg-card p-4 sm:p-5">
                    <p className="text-sm uppercase tracking-wide text-muted-foreground">
                      {row.kind === 'sustain' ? 'Sustain' : 'Release'}
                    </p>
                    <p className="text-base font-medium sm:text-lg">{row.summary}</p>
                    {row.programNotes?.trim() ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p>
                    ) : null}
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
