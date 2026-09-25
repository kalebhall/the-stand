'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export type ProgramMeeting = {
  id: string;
  meetingDate: string;
  meetingType: string;
  status: string;
  programItemCount: number;
};

export function ProgramsClient({ meetings }: { meetings: ProgramMeeting[] }) {
  const t = useTranslations('programs');
  if (!meetings.length) {
    return <section className="rounded-lg border bg-card p-8 text-center"><h2 className="text-lg font-semibold">{t('noUpcoming')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('createMeetingFirst')}</p></section>;
  }
  return (
    <section className="grid gap-4 md:grid-cols-2" aria-label={t('upcomingPrograms')}>
      {meetings.map((meeting) => (
        <article key={meeting.id} className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-semibold">{meeting.meetingDate}</h2><p className="text-sm text-muted-foreground">{meeting.meetingType.replaceAll('_', ' ')}</p></div>
            <span className="rounded-full border px-2 py-1 text-xs">{meeting.status}</span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t('programItems', { count: meeting.programItemCount })}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/programs/${meeting.id}`} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">{t('openDesigner')}</Link>
            <Link href={`/meetings/${meeting.id}/print?draft=1`} className="rounded-md border px-3 py-2 text-sm font-medium">{t('previewCurrent')}</Link>
          </div>
        </article>
      ))}
    </section>
  );
}
