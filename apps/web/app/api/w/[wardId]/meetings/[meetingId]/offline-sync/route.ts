import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings, canUseInternalNotes } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const targetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MEETING'), meetingId: z.string().uuid() }),
  z.object({ type: z.literal('PROGRAM_ITEM'), programItemId: z.string().uuid() })
]);
const mutationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  wardId: z.string().uuid(),
  operation: z.enum(['CREATE_PRIVATE_NOTE', 'UPDATE_PRIVATE_NOTE', 'MARK_BUSINESS_ANNOUNCED']),
  payload: z.object({
    target: targetSchema.optional(),
    noteId: z.string().uuid().optional(),
    localNoteId: z.string().optional(),
    lineId: z.string().uuid().optional(),
    noteText: z.string().trim().max(10000).default(''),
    baseRevision: z.string().datetime().optional()
  })
});
const requestSchema = z.object({ mutations: z.array(mutationSchema).min(1).max(50) });
type StoredResponse = {
  mutationId: string;
  status: 'applied' | 'duplicate' | 'conflict' | 'rejected';
  operation?: string;
  noteId?: string;
  lineId?: string;
  updatedAt?: string;
  serverText?: string;
  serverStatus?: string;
  serverRevision?: string;
  error?: string;
};

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, meetingId } = await context.params;
  const canUseNotes = canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);
  const canManage = canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);
  if (!canUseNotes && !canManage) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid offline mutation payload', code: 'VALIDATION_ERROR' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meetingCheck = await client.query('SELECT id, meeting_date, meeting_type FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [
      meetingId,
      wardId
    ]);
    if (!meetingCheck.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const results: StoredResponse[] = [];
    for (const mutation of parsed.data.mutations) {
      if (mutation.userId !== session.user.id || mutation.wardId !== wardId) {
        results.push({ mutationId: mutation.id, status: 'rejected', error: 'Mutation context mismatch' });
        continue;
      }
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',
        [mutation.id]
      );
      const ledger = await client.query(
        'SELECT meeting_id, operation, request_payload, response FROM offline_mutation WHERE mutation_id = $1::uuid AND ward_id = $2::uuid AND user_id = $3::uuid LIMIT 1',
        [mutation.id, wardId, session.user.id]
      );
      if (ledger.rowCount) {
        const storedRow = ledger.rows[0] as { meeting_id: string | null; operation: string; request_payload: unknown; response: StoredResponse };
        const storedRequest = storedRow.request_payload;
        const hasRequestIdentity = storedRequest && typeof storedRequest === 'object' && Object.keys(storedRequest).length > 0;
        if (storedRow.meeting_id !== meetingId || storedRow.operation !== mutation.operation || (hasRequestIdentity && JSON.stringify(storedRequest) !== JSON.stringify(mutation.payload))) {
          results.push({ mutationId: mutation.id, status: 'rejected', error: 'Mutation ID collision' });
          continue;
        }
        const stored = storedRow.response;
        results.push({ ...stored, status: stored.status === 'applied' ? 'duplicate' : stored.status });
        continue;
      }
      const reservation = await client.query(
        'INSERT INTO offline_mutation (mutation_id, ward_id, user_id, meeting_id, operation, request_payload, status, response) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7::text, $8::jsonb) ON CONFLICT (mutation_id) DO NOTHING RETURNING mutation_id',
        [mutation.id, wardId, session.user.id, meetingId, mutation.operation, JSON.stringify(mutation.payload), 'REJECTED', JSON.stringify({ mutationId: mutation.id, status: 'rejected', error: 'Processing' })]
      );
      if (!reservation.rowCount) {
        const duplicate = await client.query(
          'SELECT ward_id, user_id, meeting_id, operation, request_payload, response FROM offline_mutation WHERE mutation_id = $1::uuid LIMIT 1',
          [mutation.id]
        );
        if (!duplicate.rowCount || duplicate.rows[0].ward_id !== wardId || duplicate.rows[0].user_id !== session.user.id || duplicate.rows[0].meeting_id !== meetingId) {
          results.push({ mutationId: mutation.id, status: 'rejected', error: 'Mutation ID collision' });
          continue;
        }
        const duplicateRequest = duplicate.rows[0].request_payload;
        const hasRequestIdentity = duplicateRequest && typeof duplicateRequest === 'object' && Object.keys(duplicateRequest).length > 0;
        if (
          duplicate.rows[0].operation !== mutation.operation ||
          (hasRequestIdentity && JSON.stringify(duplicateRequest) !== JSON.stringify(mutation.payload))
        ) {
          results.push({ mutationId: mutation.id, status: 'rejected', error: 'Mutation ID collision' });
          continue;
        }
        const stored = duplicate.rows[0].response as StoredResponse;
        results.push({ ...stored, status: stored.status === 'applied' ? 'duplicate' : stored.status });
        continue;
      }
      let result: StoredResponse;
      if (mutation.operation === 'MARK_BUSINESS_ANNOUNCED' && mutation.payload.lineId) {
        if (!canManage || ['STAKE_CONFERENCE', 'GENERAL_CONFERENCE'].includes(meetingCheck.rows[0].meeting_type)) result = { mutationId: mutation.id, status: 'rejected', error: 'Forbidden' };
        else {
          const updated = await client.query(
            "UPDATE meeting_business_line b SET status = 'announced', updated_at = now() WHERE b.id = $1::uuid AND b.ward_id = $2::uuid AND b.status = 'pending' AND b.updated_at = $5::timestamptz AND (b.meeting_id = $3::uuid OR (b.action_type = 'SUSTAIN' AND b.calling_assignment_id IS NOT NULL AND EXISTS (SELECT 1 FROM meeting sm WHERE sm.id = b.meeting_id AND sm.ward_id = b.ward_id AND sm.meeting_date <= $4::date AND sm.meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE') AND NOT EXISTS (SELECT 1 FROM meeting route_meeting WHERE route_meeting.id = $3::uuid AND route_meeting.meeting_type IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')) AND (SELECT ca.action_status FROM calling_action ca WHERE ca.calling_assignment_id = b.calling_assignment_id AND ca.ward_id = b.ward_id ORDER BY ca.created_at DESC LIMIT 1) = 'EXTENDED')) RETURNING b.id, b.updated_at",
            [mutation.payload.lineId, wardId, meetingId, meetingCheck.rows[0].meeting_date, mutation.payload.baseRevision]
          );
          if (updated.rowCount) {
            await recordAuditEvent(client, {
              wardId,
              userId: session.user.id,
              actorName: session.user.name ?? session.user.email ?? null,
              action: 'BUSINESS_LINE_ANNOUNCED',
              entityType: 'meeting_business_line',
              entityId: mutation.payload.lineId,
              details: { meetingId, source: 'offline_sync' },
              source: 'manual_ui'
            });
            result = {
              mutationId: mutation.id,
              status: 'applied',
              lineId: mutation.payload.lineId,
              updatedAt: updated.rows[0].updated_at.toISOString()
            };
          } else {
            const exists = await client.query(
              `SELECT b.id, b.status, b.updated_at FROM meeting_business_line b WHERE b.id = $1::uuid AND b.ward_id = $2::uuid AND (b.meeting_id = $3::uuid OR (b.action_type = 'SUSTAIN' AND b.calling_assignment_id IS NOT NULL AND EXISTS (SELECT 1 FROM meeting sm WHERE sm.id = b.meeting_id AND sm.ward_id = b.ward_id AND sm.meeting_date <= $4::date AND sm.meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE') AND NOT EXISTS (SELECT 1 FROM meeting route_meeting WHERE route_meeting.id = $3::uuid AND route_meeting.meeting_type IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')) AND (SELECT ca.action_status FROM calling_action ca WHERE ca.calling_assignment_id = b.calling_assignment_id AND ca.ward_id = b.ward_id ORDER BY ca.created_at DESC LIMIT 1) = 'EXTENDED')) LIMIT 1`,
              [mutation.payload.lineId, wardId, meetingId, meetingCheck.rows[0].meeting_date]
            );
            result = exists.rowCount
              ? {
                  mutationId: mutation.id,
                  operation: mutation.operation,
                  status: 'conflict',
                  lineId: mutation.payload.lineId,
                  serverStatus: exists.rows[0].status,
                  serverRevision: exists.rows[0].updated_at.toISOString(),
                  error: 'Business line changed while offline'
                }
              : { mutationId: mutation.id, status: 'rejected', error: 'Business line not found or already announced' };
          }
        }
      } else if (mutation.operation === 'CREATE_PRIVATE_NOTE' && mutation.payload.target) {
        if (!canUseNotes) result = { mutationId: mutation.id, status: 'rejected', error: 'Forbidden' };
        else {
          const target = mutation.payload.target;
          const targetColumn = target.type === 'MEETING' ? 'meeting_id' : 'program_item_id';
          const targetId = target.type === 'MEETING' ? target.meetingId : target.programItemId;
          const targetCheck =
            target.type === 'MEETING'
              ? await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid AND id = $3::uuid LIMIT 1', [targetId, wardId, meetingId])
              : await client.query(
                  'SELECT id FROM meeting_program_item WHERE id = $1::uuid AND ward_id = $2::uuid AND meeting_id = $3::uuid LIMIT 1',
                  [targetId, wardId, meetingId]
                );
          if (!targetCheck.rowCount) result = { mutationId: mutation.id, status: 'rejected', error: 'Note target not found' };
          else {
            const inserted = await client.query(
              `INSERT INTO internal_note (ward_id, ${targetColumn}, visibility, note_text, created_by_user_id) VALUES ($1::uuid, $2::uuid, 'PRIVATE', $3::text, $4::uuid) RETURNING id, updated_at`,
              [wardId, targetId, mutation.payload.noteText, session.user.id]
            );
            await recordAuditEvent(client, {
              wardId,
              userId: session.user.id,
              actorName: session.user.name ?? session.user.email ?? null,
              action: 'INTERNAL_NOTE_CREATED',
              entityType: 'internal_note',
              entityId: inserted.rows[0].id,
              details: { visibility: 'PRIVATE', source: 'offline_sync' },
              source: 'manual_ui'
            });
            result = {
              mutationId: mutation.id,
              status: 'applied',
              noteId: inserted.rows[0].id,
              updatedAt: inserted.rows[0].updated_at.toISOString()
            };
          }
        }
      } else if (mutation.operation === 'UPDATE_PRIVATE_NOTE' && mutation.payload.noteId) {
        if (!canUseNotes) result = { mutationId: mutation.id, status: 'rejected', error: 'Forbidden' };
        else {
          const noteScope = await client.query(
            `SELECT n.id
               FROM internal_note n
               LEFT JOIN meeting_program_item pi ON pi.id = n.program_item_id AND pi.ward_id = n.ward_id
              WHERE n.id = $1::uuid
                AND n.ward_id = $2::uuid
                AND n.created_by_user_id = $3::uuid
                AND n.visibility = 'PRIVATE'
                AND (n.meeting_id = $4::uuid OR pi.meeting_id = $4::uuid)
              LIMIT 1`,
            [mutation.payload.noteId, wardId, session.user.id, meetingId]
          );
          if (!noteScope.rowCount) result = { mutationId: mutation.id, status: 'rejected', error: 'Private note not found' };
          else {
          const updated = await client.query(
            "UPDATE internal_note SET note_text = $1::text, updated_at = now() WHERE id = $2::uuid AND ward_id = $3::uuid AND created_by_user_id = $4::uuid AND visibility = 'PRIVATE' AND updated_at = $5::timestamptz RETURNING id, updated_at",
            [mutation.payload.noteText, mutation.payload.noteId, wardId, session.user.id, mutation.payload.baseRevision]
          );
          if (updated.rowCount)
            result = {
              mutationId: mutation.id,
              status: 'applied',
              noteId: mutation.payload.noteId,
              updatedAt: updated.rows[0].updated_at.toISOString()
            };
          else {
            const exists = await client.query(
              "SELECT id, note_text, updated_at FROM internal_note WHERE id = $1::uuid AND ward_id = $2::uuid AND created_by_user_id = $3::uuid AND visibility = 'PRIVATE' LIMIT 1",
              [mutation.payload.noteId, wardId, session.user.id]
            );
            result = exists.rowCount
              ? {
                  mutationId: mutation.id,
                  status: 'conflict',
                  noteId: mutation.payload.noteId,
                  serverText: exists.rows[0].note_text,
                  serverRevision: exists.rows[0].updated_at.toISOString(),
                  error: 'Private note changed while offline'
                }
              : { mutationId: mutation.id, status: 'rejected', error: 'Private note not found' };
          }
        }
        }
      } else result = { mutationId: mutation.id, status: 'rejected', error: 'Invalid offline mutation' };
      await client.query(
        'UPDATE offline_mutation SET status = $2::text, response = $3::jsonb WHERE mutation_id = $1::uuid AND ward_id = $4::uuid AND user_id = $5::uuid',
        [mutation.id, result.status === 'applied' ? 'APPLIED' : result.status === 'conflict' ? 'CONFLICT' : 'REJECTED', JSON.stringify(result), wardId, session.user.id]
      );
      results.push(result);
    }
    await client.query('COMMIT');
    return NextResponse.json({ results });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('offline_mutation_sync_failed', { wardId, userId: session.user.id, error });
    return NextResponse.json({ error: 'Failed to sync offline changes', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
