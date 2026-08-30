import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { canUseInternalNotes } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { recordAuditEvent } from '@/src/audit/service';

const targetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MEETING'), meetingId: z.string().uuid() }),
  z.object({ type: z.literal('PROGRAM_ITEM'), programItemId: z.string().uuid() })
]);
const mutationSchema = z.object({
  id: z.string().uuid(),
  operation: z.enum(['CREATE_PRIVATE_NOTE', 'UPDATE_PRIVATE_NOTE']),
  payload: z.object({ target: targetSchema.optional(), noteId: z.string().uuid().optional(), noteText: z.string().trim().min(1).max(10000) })
});
const requestSchema = z.object({ mutations: z.array(mutationSchema).min(1).max(50) });

type StoredResponse = { mutationId: string; status: 'applied' | 'duplicate' | 'rejected'; noteId?: string; error?: string };

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, meetingId } = await context.params;
  if (!canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid offline mutation payload', code: 'VALIDATION_ERROR' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meetingCheck = await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [meetingId, wardId]);
    if (!meetingCheck.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const results: StoredResponse[] = [];
    for (const mutation of parsed.data.mutations) {
      const existing = await client.query('SELECT response FROM offline_mutation WHERE mutation_id = $1::uuid AND ward_id = $2::uuid AND user_id = $3::uuid LIMIT 1', [mutation.id, wardId, session.user.id]);
      if (existing.rowCount) {
        results.push({ ...(existing.rows[0].response as StoredResponse), status: 'duplicate' });
        continue;
      }

      let result: StoredResponse;
      if (mutation.operation === 'CREATE_PRIVATE_NOTE' && mutation.payload.target) {
        const target = mutation.payload.target;
        const targetColumn = target.type === 'MEETING' ? 'meeting_id' : 'program_item_id';
        const targetId = target.type === 'MEETING' ? target.meetingId : target.programItemId;
        const targetCheck = target.type === 'MEETING'
          ? await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [targetId, wardId])
          : await client.query('SELECT id FROM meeting_program_item WHERE id = $1::uuid AND ward_id = $2::uuid AND meeting_id = $3::uuid LIMIT 1', [targetId, wardId, meetingId]);
        if (!targetCheck.rowCount) result = { mutationId: mutation.id, status: 'rejected', error: 'Note target not found' };
        else {
          const inserted = await client.query(`INSERT INTO internal_note (ward_id, ${targetColumn}, visibility, note_text, created_by_user_id) VALUES ($1::uuid, $2::uuid, 'PRIVATE', $3::text, $4::uuid) RETURNING id`, [wardId, targetId, mutation.payload.noteText, session.user.id]);
          await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name ?? session.user.email ?? null, action: 'INTERNAL_NOTE_CREATED', entityType: 'internal_note', entityId: inserted.rows[0].id, details: { visibility: 'PRIVATE', source: 'offline_sync' }, source: 'manual_ui' });
          result = { mutationId: mutation.id, status: 'applied', noteId: inserted.rows[0].id };
        }
      } else if (mutation.operation === 'UPDATE_PRIVATE_NOTE' && mutation.payload.noteId) {
        const updated = await client.query('UPDATE internal_note SET note_text = $1::text, updated_at = now() WHERE id = $2::uuid AND ward_id = $3::uuid AND created_by_user_id = $4::uuid AND visibility = \'PRIVATE\' RETURNING id', [mutation.payload.noteText, mutation.payload.noteId, wardId, session.user.id]);
        result = updated.rowCount ? { mutationId: mutation.id, status: 'applied', noteId: mutation.payload.noteId } : { mutationId: mutation.id, status: 'rejected', error: 'Private note not found' };
      } else result = { mutationId: mutation.id, status: 'rejected', error: 'Invalid private note mutation' };

      await client.query('INSERT INTO offline_mutation (mutation_id, ward_id, user_id, operation, status, response) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::jsonb)', [mutation.id, wardId, session.user.id, mutation.operation, result.status === 'applied' ? 'APPLIED' : 'REJECTED', JSON.stringify(result)]);
      results.push(result);
    }
    await client.query('COMMIT');
    return NextResponse.json({ results });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('offline_mutation_sync_failed', { wardId, userId: session.user.id, error });
    return NextResponse.json({ error: 'Failed to sync offline changes', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}
