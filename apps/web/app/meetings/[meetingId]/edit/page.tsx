import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { InternalNotesPanel, type InternalNoteRow } from '@/components/InternalNotesPanel';
import { MembershipOrdinanceSection, type MembershipOrdinanceAction } from '@/components/MembershipOrdinanceSection';
import type { BusinessLine } from '@/components/WardBusinessSection';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings, canUseInternalNotes, canViewProgramDesigner } from '@/src/auth/roles';
import { isAnnouncementActiveForDate } from '@/src/announcements/types';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import type { IntroductionRoles, ProgramItemInput } from '@/src/meetings/types';
import { formatDateTimeForDisplay } from '@/src/meetings/date';

import { MeetingForm } from '../../meeting-form';

type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
};

type ProgramItemRow = {
  id: string;
  item_type: string;
  title: string | null;
  notes: string | null;
  topic: string | null;
  program_notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
  introduction_roles: IntroductionRoles | null;
  speaker_status: ProgramItemInput['speakerStatus'];
};

type MeetingRenderVersionRow = {
  version: number;
  created_at: string;
};

type AnnouncementRow = {
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_permanent: boolean;
  include_in_stand: boolean;
};

export default async function EditMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await requireAuthenticatedSession();
  const t = await getTranslations('meetingEditor');
  enforcePasswordRotation(session);

  if (
    !session.activeWardId ||
    !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)
  ) {
    redirect('/meetings');
  }

  const { meetingId } = await params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingResult = await client.query('SELECT id, meeting_date, meeting_type FROM meeting WHERE id = $1 AND ward_id = $2 LIMIT 1', [
      meetingId,
      session.activeWardId
    ]);

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      notFound();
    }

    const programItemsResult = await client.query(
      `SELECT id, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, introduction_roles, speaker_status
         FROM meeting_program_item
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY sequence ASC`,
      [meetingId, session.activeWardId]
    );

    const versionsResult = await client.query(
      `SELECT version, created_at
         FROM meeting_program_render
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY version DESC`,
      [meetingId, session.activeWardId]
    );

    const businessLinesResult = await client.query(
      `SELECT b.id, b.member_name, b.calling_name, b.action_type, b.status,
              b.calling_assignment_id, (b.meeting_id <> $1::uuid) AS carried_forward
         FROM meeting_business_line b
         JOIN meeting source_meeting ON source_meeting.id = b.meeting_id AND source_meeting.ward_id = b.ward_id
         LEFT JOIN LATERAL (
           SELECT action_status
             FROM calling_action ca
            WHERE ca.calling_assignment_id = b.calling_assignment_id
              AND ca.ward_id = b.ward_id
            ORDER BY ca.created_at DESC
            LIMIT 1
         ) latest_calling ON TRUE
        WHERE b.ward_id = $2::uuid
          AND source_meeting.meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')
          AND (SELECT meeting_type FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid) NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')
          AND (b.action_type <> 'SUSTAIN' OR b.calling_assignment_id IS NULL OR latest_calling.action_status = 'EXTENDED')
          AND (b.meeting_id = $1::uuid OR (
            b.action_type = 'SUSTAIN'
            AND b.calling_assignment_id IS NOT NULL
            AND source_meeting.meeting_date <= $3::date
            AND latest_calling.action_status = 'EXTENDED'
          ))
        ORDER BY b.created_at ASC`,
      [meetingId, session.activeWardId, meetingResult.rows[0].meeting_date]
    );

    const membershipActionsResult = await client.query(
      `SELECT a.id, a.member_name, a.action_type, a.priesthood_office, a.reason, a.details,
              CASE WHEN a.meeting_id <> $1::uuid AND a.status = 'pending' THEN 'action_needed' ELSE a.status END AS status,
              a.planned_date, a.interview_status, a.interview_date, a.interviewer_name, a.approval_confirmed, a.presenting_leader, a.performing_priesthood_holder, a.ordinance_date, a.baptism_date, a.confirmation_date, a.baptism_status, a.confirmation_status, a.responsible_leader, a.lcr_follow_up_status, a.lcr_updated_at,
              m.meeting_date AS source_meeting_date, (a.meeting_id <> $1::uuid) AS carried_forward
         FROM meeting_membership_ordinance a
         JOIN meeting m ON m.id = a.meeting_id AND m.ward_id = a.ward_id
        WHERE a.ward_id = $2::uuid
          AND m.meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')
          AND (SELECT meeting_type FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid) NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')
          AND (a.meeting_id = $1::uuid OR (m.meeting_date <= $3::date AND a.status <> 'completed'))
        ORDER BY a.created_at ASC`,
      [meetingId, session.activeWardId, meetingResult.rows[0].meeting_date]
    );

    const announcementsResult = await client.query(
      `SELECT title, body, start_date, end_date, is_permanent, include_in_stand
         FROM announcement
        WHERE ward_id = $1::uuid AND include_in_stand = TRUE
        ORDER BY created_at DESC`,
      [session.activeWardId]
    );

    const notesResult = await client.query(
      `SELECT note.id, note.program_item_id, note.visibility, note.note_text, note.created_at, ua.email AS created_by_email
         FROM internal_note note
         LEFT JOIN user_account ua ON ua.id = note.created_by_user_id
        WHERE note.ward_id = $1::uuid
          AND (
            note.meeting_id = $2::uuid
            OR note.program_item_id IN (
              SELECT id FROM meeting_program_item WHERE meeting_id = $2::uuid AND ward_id = $1::uuid
            )
          )
          AND (note.visibility IN ('LEADERSHIP', 'PUBLIC') OR note.created_by_user_id = $3::uuid)
        ORDER BY note.created_at DESC`,
      [session.activeWardId, meetingId, session.user.id]
    );

    await client.query('COMMIT');

    const meeting = meetingResult.rows[0] as MeetingRow;
    const programItems = (programItemsResult.rows as ProgramItemRow[]).map((item) => ({
      id: item.id,
      itemType: item.item_type,
      title: item.title ?? '',
      notes: item.notes ?? '',
      topic: item.topic ?? '',
      programNotes: item.program_notes ?? '',
      hymnNumber: item.hymn_number ?? '',
      hymnTitle: item.hymn_title ?? '',
      introductionRoles: item.introduction_roles ?? undefined,
      speakerStatus: item.speaker_status ?? undefined
    }));
    const versions = versionsResult.rows as MeetingRenderVersionRow[];
    const businessLines = businessLinesResult.rows as BusinessLine[];
    const membershipActions = membershipActionsResult.rows as MembershipOrdinanceAction[];
    const notes = notesResult.rows as InternalNoteRow[];
    const canUseNotes = canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);
    const standAnnouncements = (announcementsResult.rows as AnnouncementRow[])
      .filter((announcement) =>
        isAnnouncementActiveForDate(
          { startDate: announcement.start_date, endDate: announcement.end_date, isPermanent: announcement.is_permanent },
          meeting.meeting_date
        )
      )
      .map(({ title, body }) => ({ title, body }));

    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) ? <Link href={`/programs/${meeting.id}`} className={cn(buttonVariants({ variant: 'default' }))}>Program Designer</Link> : null}
            <Link href="/manual#meeting-editor" className="text-sm font-medium underline underline-offset-4">
              Editor help
            </Link>
            <Link href={`/stand/${meeting.id}`} className={cn(buttonVariants({ variant: 'outline' }))}>
              {t('atStand')}
            </Link>
            <Link href={`/meetings/${meeting.id}/print`} className={cn(buttonVariants({ variant: 'outline' }))}>
              {t('printView')}
            </Link>
            <Link href={`/meetings/${meeting.id}/public-preview`} className={cn(buttonVariants({ variant: 'outline' }))}>
              {t('publicPreview')}
            </Link>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">{t('publishedVersions')}</h2>
          {versions.length ? (
            <ul className="mt-3 space-y-2">
              {versions.map((version) => (
                <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{t('version', { version: version.version })}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('published', { date: formatDateTimeForDisplay(version.created_at) })}
                    </p>
                  </div>
                  <Link
                    href={`/meetings/${meeting.id}/print?version=${version.version}`}
                    className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
                  >
                    {t('viewSnapshot')}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t('noPublishedVersions')}</p>
          )}
        </section>

        <MeetingForm
          wardId={session.activeWardId}
          mode="edit"
          meetingId={meeting.id}
          initialMeetingDate={meeting.meeting_date}
          initialMeetingType={meeting.meeting_type}
          initialProgramItems={programItems}
          publishedVersionCount={versions.length}
          internalNotes={notes}
          canUseInternalNotes={canUseNotes}
          businessLines={businessLines}
          canManageBusiness={true}
          standAnnouncements={standAnnouncements}
        />

        <MembershipOrdinanceSection
          wardId={session.activeWardId}
          meetingId={meeting.id}
          actions={membershipActions}
          canManage
          canCreate={false}
        />

        <InternalNotesPanel
          wardId={session.activeWardId}
          target={{ type: 'MEETING', meetingId }}
          notes={notes.filter((note) => !note.program_item_id)}
          title={t('meetingNotes')}
        />
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load meeting');
  } finally {
    client.release();
  }
}
