import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { isWardFeatureEnabled } from '@/src/features/flags';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { SPEAKER_STATUSES, validateSpeakerStatusTransition, type SpeakerStatus } from '@/src/meetings/types';

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; programItemId: string }> }) {
  const session = await auth();
  const { wardId, programItemId } = await context.params;
  if (!session?.user?.id || !session.activeWardId || session.activeWardId !== wardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) || !(await isWardFeatureEnabled(wardId, session.user.id, 'SPEAKER_LIFECYCLE'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { topic?: unknown; speakerStatus?: unknown } | null;
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  const nextStatus = body?.speakerStatus;
  if (!SPEAKER_STATUSES.includes(nextStatus as SpeakerStatus)) return NextResponse.json({ error: 'Invalid speaker status.' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const currentResult = await client.query(
      `SELECT speaker_status, topic FROM meeting_program_item WHERE id = $1::uuid AND ward_id = $2::uuid AND item_type = 'SPEAKER' FOR UPDATE`,
      [programItemId, wardId]
    );
    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Speaker not found.' }, { status: 404 });
    }
    const currentStatus = (currentResult.rows[0].speaker_status ?? 'PLANNED') as SpeakerStatus;
    const error = validateSpeakerStatusTransition(currentStatus, nextStatus as SpeakerStatus, topic || currentResult.rows[0].topic);
    if (error) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error }, { status: 400 });
    }
    await client.query(
      `UPDATE meeting_program_item SET topic = $1::text, speaker_status = $2::text WHERE id = $3::uuid AND ward_id = $4::uuid`,
      [topic || null, nextStatus, programItemId, wardId]
    );
    await client.query('COMMIT');
    return NextResponse.json({ ok: true, topic, speakerStatus: nextStatus });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Unable to update speaker.' }, { status: 500 });
  } finally {
    client.release();
  }
}
