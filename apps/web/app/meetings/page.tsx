import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/platform/auth/session';
import { canManageMeetings, canViewMeetings } from '@/src/platform/permissions';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/platform/db/context';
import { formatMeetingDateForDisplay } from '@/src/meetings/date';

import { DeleteMeetingButton } from './delete-meeting-button';

type MeetingRow = {
  id: string;
  meeting_date: unknown;
  meeting_type: string;
  status: string;
};

const MEETING_STATUS_KEYS = {
  DRAFT: 'status_DRAFT',
  PUBLISHED: 'status_PUBLISHED',
  COMPLETED: 'status_COMPLETED'
} as const;

const MEETING_TYPE_KEYS = {
  SACRAMENT: 'type_SACRAMENT',
  FAST_TESTIMONY: 'type_FAST_TESTIMONY',
  WARD_CONFERENCE: 'type_WARD_CONFERENCE',
  STAKE_CONFERENCE: 'type_STAKE_CONFERENCE',
  GENERAL_CONFERENCE: 'type_GENERAL_CONFERENCE'
} as const;

export default async function MeetingsPage() {
  const t = await getTranslations('meetings');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }
  const wardId = session.activeWardId;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingsResult = await client.query(
      'SELECT id, meeting_date, meeting_type, status FROM meeting WHERE ward_id = $1 ORDER BY meeting_date DESC',
      [session.activeWardId]
    );

    await client.query('COMMIT');

    const meetings = meetingsResult.rows as MeetingRow[];
    const canManage = canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/manual#meetings" className="text-sm font-medium underline underline-offset-4">
              Meeting help
            </Link>
            {canManage ? (
              <Link href="/meetings/new" className={cn(buttonVariants())}>
                {t('create')}
              </Link>
            ) : null}
          </div>
        </section>

        {meetings.length ? (
          <section className="space-y-3">
            {meetings.map((meeting) => (
              <article
                key={meeting.id}
                className="section-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
              >
                <div>
                  <p className="text-base font-semibold">{formatMeetingDateForDisplay(meeting.meeting_date)}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(MEETING_TYPE_KEYS[meeting.meeting_type as keyof typeof MEETING_TYPE_KEYS] ?? 'type_UNKNOWN')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2 py-1 text-xs font-medium">
                    {t(MEETING_STATUS_KEYS[meeting.status as keyof typeof MEETING_STATUS_KEYS] ?? 'status_UNKNOWN')}
                  </span>
                  {canManage ? (
                    <Link href={`/meetings/${meeting.id}/edit`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
                      {t('edit')}
                    </Link>
                  ) : null}
                  {canManage ? <DeleteMeetingButton wardId={wardId} meetingId={meeting.id} /> : null}
                  <Link href={`/stand/${meeting.id}`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
                    {t('atStand')}
                  </Link>
                  <Link href={`/meetings/${meeting.id}/print`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
                    {t('print')}
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="section-panel rounded-lg border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">{t('noScheduled')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('noScheduledDetail')}</p>
            {canManage ? (
              <Link href="/meetings/new" className={cn(buttonVariants({ className: 'mt-4' }))}>
                {t('createFirst')}
              </Link>
            ) : null}
          </section>
        )}
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load meetings');
  } finally {
    client.release();
  }
}
