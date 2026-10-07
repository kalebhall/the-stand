import type { PoolClient } from 'pg';

import { recordAuditEvent } from '@/src/audit/service';
import { insertNotificationOutboxEvent } from '@/src/notifications/outbox';

import type { ProgramItemSourceRow, MeetingSource } from './program-item-source';

export { isSourceManaged } from './program-item-source';

export type ProgramItemsDbContext = {
  meeting: MeetingSource;
  rows: ProgramItemSourceRow[];
};

const itemColumns = (includeInternalNotes: boolean) =>
  `id, sequence, item_type, title, ${includeInternalNotes ? 'notes' : 'NULL::text AS notes'}, topic, program_notes, hymn_number, hymn_title, hymn_locale, ${includeInternalNotes ? 'introduction_roles' : "CASE WHEN introduction_roles IS NULL THEN NULL ELSE introduction_roles - 'visitingLeaders' END AS introduction_roles"}, speaker_status`;

export type ReadProgramItemsOptions = { includeInternalNotes?: boolean };

export async function readProgramItems(
  client: PoolClient,
  wardId: string,
  meetingId: string,
  lock = false,
  options: ReadProgramItemsOptions = {}
): Promise<ProgramItemsDbContext | null> {
  const includeInternalNotes = options.includeInternalNotes !== false;
  const meetingResult = await client.query(
    `SELECT id, meeting_date, meeting_type
       FROM meeting
      WHERE id = $1::uuid AND ward_id = $2::uuid
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [meetingId, wardId]
  );
  const meetingRow = meetingResult.rows[0] as { id: string; meeting_date: string; meeting_type: string } | undefined;
  if (!meetingRow) return null;

  const itemResult = await client.query(
    `SELECT ${itemColumns(includeInternalNotes)}
       FROM meeting_program_item
      WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
      ORDER BY sequence ASC, id ASC${lock ? ' FOR UPDATE' : ''}`,
    [meetingId, wardId]
  );
  return {
    meeting: { id: meetingRow.id, meetingDate: String(meetingRow.meeting_date), meetingType: meetingRow.meeting_type },
    rows: itemResult.rows as ProgramItemSourceRow[]
  };
}

export function textColumn(field: 'title' | 'topic' | 'notes' | 'programNotes'): string {
  return ({ title: 'title', topic: 'topic', notes: 'notes', programNotes: 'program_notes' } as const)[field];
}

export async function synchronizePublicProgramNote(
  client: Pick<PoolClient, 'query'>,
  params: {
    wardId: string;
    meetingId?: string;
    programItemId: string;
    noteText: string | null;
    userId: string;
    actorName?: string | null;
  }
): Promise<string[]> {
  const desiredText = params.noteText?.trim() || null;
  const linkedNotes = await client.query(
    "SELECT id, note_text FROM internal_note WHERE program_item_id = $1::uuid AND ward_id = $2::uuid AND visibility = 'PUBLIC' ORDER BY id ASC FOR UPDATE",
    [params.programItemId, params.wardId]
  );
  const eventOutboxIds: string[] = [];

  for (const linkedNote of linkedNotes.rows as Array<{ id: string; note_text: string }>) {
    if (desiredText && linkedNote.note_text === desiredText) continue;

    if (desiredText) {
      await client.query('UPDATE internal_note SET note_text = $1::text, updated_at = now() WHERE id = $2::uuid AND ward_id = $3::uuid', [
        desiredText,
        linkedNote.id,
        params.wardId
      ]);
    } else {
      await client.query('DELETE FROM internal_note WHERE id = $1::uuid AND ward_id = $2::uuid', [linkedNote.id, params.wardId]);
    }

    await recordAuditEvent(client, {
      wardId: params.wardId,
      userId: params.userId,
      actorName: params.actorName ?? null,
      action: desiredText ? 'INTERNAL_NOTE_UPDATED' : 'INTERNAL_NOTE_DELETED',
      entityType: 'internal_note',
      entityId: linkedNote.id,
      details: {
        synchronizedFrom: 'program_item',
        programItemId: params.programItemId,
        ...(params.meetingId ? { meetingId: params.meetingId } : {})
      },
      source: 'manual_ui'
    });
    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId: params.wardId,
      aggregateType: 'internal_note',
      aggregateId: linkedNote.id,
      eventType: desiredText ? 'NOTE_UPDATED' : 'NOTE_DELETED',
      payload: {
        noteId: linkedNote.id,
        visibility: 'PUBLIC',
        actorUserId: params.userId,
        programItemId: params.programItemId,
        ...(params.meetingId ? { meetingId: params.meetingId } : {}),
        synchronizedFrom: 'program_item'
      }
    });
    if (eventOutboxId) eventOutboxIds.push(eventOutboxId);
  }

  return eventOutboxIds;
}
