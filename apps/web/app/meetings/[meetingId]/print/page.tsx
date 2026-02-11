import { notFound, redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type MeetingRow = {
  meeting_date: string;
  meeting_type: string;
};

type ProgramItemRow = {
  item_type: string;
  title: string | null;
  notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
};

const SACRAMENT_PRAYERS = [
  'Bread prayer: O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this bread to the souls of all those who partake of it...',
  'Water prayer: O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this water to the souls of all those who drink of it...'
];

function displayHymn(item: ProgramItemRow) {
  if (item.hymn_number || item.hymn_title) {
    return [item.hymn_number ? `#${item.hymn_number}` : null, item.hymn_title || null].filter(Boolean).join(' — ');
  }

  return item.title ?? '';
}

export default async function PrintMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/meetings');
  }

  const { meetingId } = await params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingResult = await client.query('SELECT meeting_date, meeting_type FROM meeting WHERE id = $1 AND ward_id = $2 LIMIT 1', [
      meetingId,
      session.activeWardId
    ]);

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

    await client.query('COMMIT');

    const meeting = meetingResult.rows[0] as MeetingRow;
    const programItems = programResult.rows as ProgramItemRow[];

    return (
      <main className="print-page mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
        <header className="space-y-2 border-b pb-4 text-center">
          <h1 className="text-2xl font-semibold">Sacrament Meeting Program</h1>
          <p className="text-sm text-muted-foreground">{meeting.meeting_date}</p>
          <p className="text-sm text-muted-foreground">{meeting.meeting_type.replaceAll('_', ' ')}</p>
        </header>

        <section className="space-y-2">
          {programItems.map((item, index) => (
            <article key={`${item.item_type}-${index}`} className="grid grid-cols-[10rem_1fr] gap-3 border-b py-2">
              <p className="text-sm font-medium">{item.item_type.replaceAll('_', ' ')}</p>
              <div className="space-y-1">
                <p className="text-sm">{displayHymn(item) || '—'}</p>
                {item.notes ? <p className="text-xs text-muted-foreground">{item.notes}</p> : null}
              </div>
            </article>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Sacrament Prayers</h2>
          {SACRAMENT_PRAYERS.map((line) => (
            <p key={line} className="text-xs leading-relaxed text-muted-foreground">
              {line}
            </p>
          ))}
        </section>
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load print view');
  } finally {
    client.release();
  }
}
