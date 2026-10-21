import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canEditProgramDesign, canEditProgramItemPatch } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabledInTransaction } from '@/src/modules/service';
import { patchProgramItemRequestSchema } from '@/src/meetings/program-item-contracts';
import { isSourceManaged, readProgramItems, synchronizePublicProgramNote, textColumn } from '@/src/meetings/program-item-service';
import { toProgramItemsResponse } from '@/src/meetings/program-item-source';
import { validateProtectedProgramOrder } from '@/src/meetings/program-item-rules';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent } from '@/src/notifications/outbox';

function errorResponse(message: string, code: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; meetingId: string; itemId: string }> }) {
  const requestBody = request.json().catch(() => null);
  const session = await auth();
  const { wardId, meetingId, itemId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  const sessionAccess = { roles: session.user.roles, activeWardId: session.activeWardId };
  if (!canEditProgramDesign(sessionAccess, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);

  const parsed = patchProgramItemRequestSchema.safeParse(await requestBody);
  if (!parsed.success) return errorResponse('Invalid program item patch', 'BAD_REQUEST', 400);
  if (
    parsed.data.patch.kind !== 'TEXT' ||
    parsed.data.patch.field !== 'programNotes' ||
    !canEditProgramItemPatch(sessionAccess, wardId, parsed.data.patch)
  ) {
    return errorResponse('This section only allows authorized program-note edits', 'FORBIDDEN', 403);
  }

  const client = await pool.connect();
  const noteOutboxIds: string[] = [];
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return errorResponse('Forbidden', 'FORBIDDEN', 403);
    }
    const contextData = await readProgramItems(client, wardId, meetingId, true, { includeInternalNotes: false });
    if (!contextData) {
      await client.query('ROLLBACK');
      return errorResponse('Meeting not found', 'NOT_FOUND', 404);
    }
    const item = contextData.rows.find((candidate) => candidate.id === itemId);
    if (!item) {
      await client.query('ROLLBACK');
      return errorResponse('Program item not found', 'NOT_FOUND', 404);
    }

    const current = toProgramItemsResponse(contextData.meeting, contextData.rows, { includeInternalNotes: false });
    if (parsed.data.expectedRevision !== current.sourceRevision) {
      await client.query('ROLLBACK');
      return errorResponse('The program changed in another session', 'REVISION_CONFLICT', 409, { current });
    }

    const protectedOrderError = validateProtectedProgramOrder(
      contextData.meeting.meetingType,
      contextData.rows.map((row) => ({ itemType: row.item_type, sequence: row.sequence }))
    );
    if (protectedOrderError) {
      await client.query('ROLLBACK');
      return errorResponse('The program has an invalid protected order', protectedOrderError.code, 422);
    }
    if (isSourceManaged(item.item_type)) {
      await client.query('ROLLBACK');
      return errorResponse(
        item.item_type.toUpperCase() === 'ANNOUNCEMENT'
          ? 'This entry is managed by Announcements'
          : 'This entry is managed by At the Stand',
        'SOURCE_MANAGED',
        422
      );
    }

    const patch = parsed.data.patch;
    await client.query(
      `UPDATE meeting_program_item
          SET ${textColumn('programNotes')} = $1
        WHERE id = $2::uuid AND meeting_id = $3::uuid AND ward_id = $4::uuid`,
      [patch.value?.trim() || null, itemId, meetingId, wardId]
    );
    noteOutboxIds.push(
      ...(await synchronizePublicProgramNote(client, {
        wardId,
        meetingId,
        programItemId: itemId,
        noteText: patch.value,
        userId: session.user.id,
        actorName: session.user.name || session.user.email || null
      }))
    );

    const updated = await readProgramItems(client, wardId, meetingId, true, { includeInternalNotes: false });
    if (!updated) {
      await client.query('ROLLBACK');
      return errorResponse('Meeting not found', 'NOT_FOUND', 404);
    }
    const updatedOrderError = validateProtectedProgramOrder(
      updated.meeting.meetingType,
      updated.rows.map((row) => ({ itemType: row.item_type, sequence: row.sequence }))
    );
    if (updatedOrderError) {
      await client.query('ROLLBACK');
      return errorResponse('The program has an invalid protected order', updatedOrderError.code, 422);
    }
    const response = toProgramItemsResponse(updated.meeting, updated.rows, { includeInternalNotes: false });
    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'PROGRAM_ITEM_UPDATED',
      entityType: 'program_item',
      entityId: itemId,
      itemType: item.item_type,
      itemTitle: item.title,
      details: { meetingId, field: 'programNotes', sourceRevision: response.sourceRevision },
      source: 'manual_ui',
      severity: 'notice'
    });
    await client.query('COMMIT');
    for (const eventOutboxId of noteOutboxIds) enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);
    return NextResponse.json({ itemId, sourceRevision: response.sourceRevision, items: response.items });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to save program entry', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
}
