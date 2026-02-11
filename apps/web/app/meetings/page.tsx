import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
  status: string;
};

export default async function MeetingsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

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
            <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
            <p className="text-sm text-muted-foreground">Upcoming and past ward meetings.</p>
          </div>
          {canManage ? (
            <Link href="/meetings/new" className={cn(buttonVariants())}>
              Create meeting
            </Link>
          ) : null}
        </section>

        {meetings.length ? (
          <section className="space-y-3">
            {meetings.map((meeting) => (
              <article key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div>
                  <p className="text-base font-semibold">{meeting.meeting_date}</p>
                  <p className="text-sm text-muted-foreground">{meeting.meeting_type.replaceAll('_', ' ')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2 py-1 text-xs font-medium">{meeting.status}</span>
                  {canManage ? (
                    <Link href={`/meetings/${meeting.id}/edit`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
                      Edit
                    </Link>
                  ) : null}
                  <Link href={`/meetings/${meeting.id}/print`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
                    Print view
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-lg border bg-card p-8 text-center">
            <h2 className="text-lg font-semibold">No meetings scheduled</h2>
            <p className="mt-2 text-sm text-muted-foreground">Create your first meeting to begin building programs and print layouts.</p>
            {canManage ? (
              <Link href="/meetings/new" className={cn(buttonVariants({ className: 'mt-4' }))}>
                Create first meeting
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
