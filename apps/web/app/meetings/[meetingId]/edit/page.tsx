import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

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
  hymn_number: string | null;
  hymn_title: string | null;
};

export default async function EditMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
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
      `SELECT id, item_type, title, notes, hymn_number, hymn_title
         FROM meeting_program_item
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY sequence ASC`,
      [meetingId, session.activeWardId]
    );

    await client.query('COMMIT');

    const meeting = meetingResult.rows[0] as MeetingRow;
    const programItems = (programItemsResult.rows as ProgramItemRow[]).map((item) => ({
      id: item.id,
      itemType: item.item_type,
      title: item.title ?? '',
      notes: item.notes ?? '',
      hymnNumber: item.hymn_number ?? '',
      hymnTitle: item.hymn_title ?? ''
    }));

    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Edit meeting</h1>
            <p className="text-sm text-muted-foreground">Update meeting details, hymns, and program order.</p>
          </div>
          <Link href={`/meetings/${meeting.id}/print`} className={cn(buttonVariants({ variant: 'outline' }))}>
            Open print view
          </Link>
        </section>

        <MeetingForm
          wardId={session.activeWardId}
          mode="edit"
          meetingId={meeting.id}
          initialMeetingDate={meeting.meeting_date}
          initialMeetingType={meeting.meeting_type}
          initialProgramItems={programItems}
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
