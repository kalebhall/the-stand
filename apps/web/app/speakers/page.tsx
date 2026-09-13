import { redirect } from 'next/navigation';

import { requireAuthenticatedSession, enforcePasswordRotation } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardFeatureEnabled } from '@/src/features/flags';
import { SpeakerLifecycleWorkspace } from './speaker-lifecycle-workspace';

export default async function SpeakersPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) || !(await isWardFeatureEnabled(session.activeWardId, session.user.id, 'SPEAKER_LIFECYCLE'))) redirect('/dashboard');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const result = await client.query(
      `SELECT item.id, item.meeting_id, item.title, item.topic, COALESCE(item.speaker_status, 'PLANNED') AS speaker_status,
              to_char(meeting.meeting_date, 'Mon DD, YYYY') || ' · ' || replace(meeting.meeting_type, '_', ' ') AS meeting_label
         FROM meeting_program_item item
         JOIN meeting ON meeting.id = item.meeting_id AND meeting.ward_id = item.ward_id
        WHERE item.ward_id = $1::uuid AND item.item_type = 'SPEAKER'
        ORDER BY meeting.meeting_date DESC, item.sequence ASC`,
      [session.activeWardId]
    );
    await client.query('COMMIT');
    const speakers = result.rows.map((row) => ({ id: row.id as string, meetingId: row.meeting_id as string, meetingLabel: row.meeting_label as string, speakerName: row.title ?? '', topic: row.topic ?? '', status: row.speaker_status as 'PLANNED' | 'INVITED' | 'ACCEPTED' | 'CONFIRMED' | 'COMPLETED' }));
    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="rounded-lg border bg-card p-5">
          <h1 className="text-2xl font-semibold tracking-tight">Speaker Lifecycle</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage topics and move each speaker through planned, invited, accepted, confirmed, and completed.</p>
        </section>
        <SpeakerLifecycleWorkspace wardId={session.activeWardId} speakers={speakers} />
      </main>
    );
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error('Failed to load speaker lifecycle workspace');
  } finally {
    client.release();
  }
}
