import { DEFAULT_MODULE_REGISTRY } from '@/src/modules/registry';
import { buildEffectiveModuleSettings } from '@/src/modules/service';
import { dispatchCoreEvent } from './dispatch';
import type { CoreEvent } from './core';
import { isCoreEventPayload } from './core';

const CORE_EVENT_TYPES = new Set(['CORE_MEETING_CREATED', 'CORE_MEETING_COMPLETED']);

export type EventOutboxDbClient = {
  query: (text: string, values?: unknown[]) => Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount?: number | null;
  }>;
};

type DbClient = EventOutboxDbClient;

export function coreEventOutboxType(event: CoreEvent): string {
  return event.type === 'MeetingCreated' ? 'CORE_MEETING_CREATED' : 'CORE_MEETING_COMPLETED';
}

export async function insertCoreEventOutboxEvent(client: DbClient, event: CoreEvent): Promise<string> {
  const result = await client.query(
    `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1::uuid, 'core_event', $2::uuid, $3::text, $4::jsonb)
     ON CONFLICT (ward_id, event_type, aggregate_id)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
       WHERE event_outbox.status = 'pending'
     RETURNING id`,
    [event.wardId, event.meetingId, coreEventOutboxType(event), JSON.stringify(event)]
  );

  if (result.rows[0]?.id) return result.rows[0].id as string;
  const existing = await client.query(
    `SELECT id FROM event_outbox
      WHERE ward_id = $1::uuid
        AND aggregate_id = $2::uuid
        AND event_type = $3::text
      LIMIT 1`,
    [event.wardId, event.meetingId, coreEventOutboxType(event)]
  );
  const id = existing.rows[0]?.id as string | undefined;
  if (!id) throw new Error('Failed to create Core event outbox record');
  return id;
}

export function isCoreEventOutboxType(eventType: string): boolean {
  return CORE_EVENT_TYPES.has(eventType);
}

export async function processCoreEventOutbox(
  client: DbClient,
  params: { wardId: string; eventOutboxId: string }
): Promise<void> {
  const result = await client.query(
    `SELECT id, aggregate_id, event_type, payload, status, available_at <= now() AS available_now
       FROM event_outbox
      WHERE ward_id = $1::uuid
        AND id = $2::uuid
      FOR UPDATE SKIP LOCKED`,
    [params.wardId, params.eventOutboxId]
  );

  if (!result.rowCount) throw new Error(`Core event outbox ${params.eventOutboxId} is not visible for ward ${params.wardId}`);
  const row = result.rows[0] as { id: string; aggregate_id: string; event_type: string; payload: unknown; status: string; available_now: boolean };
  if (!isCoreEventOutboxType(row.event_type)) throw new Error(`Unsupported Core event outbox type ${row.event_type}`);
  if (row.status !== 'pending' || !row.available_now) return;

  if (!isCoreEventPayload(row.payload)) throw new Error(`Invalid Core event payload for outbox ${row.id}`);
  const event = row.payload;
  if (coreEventOutboxType(event) !== row.event_type || event.meetingId !== row.aggregate_id) {
    throw new Error(`Core event ${row.id} does not match its persisted outbox identity`);
  }
  if (event.wardId !== params.wardId) throw new Error(`Core event ${row.id} has an invalid ward boundary`);

  const meetingResult = await client.query(
    `SELECT meeting_date::text AS meeting_date, meeting_type
       FROM meeting
      WHERE id = $1::uuid
        AND ward_id = $2::uuid
      LIMIT 1`,
    [event.meetingId, params.wardId]
  );
  const meeting = meetingResult.rows[0] as { meeting_date: string; meeting_type: string } | undefined;
  if (!meeting) throw new Error(`Core event ${row.id} references no meeting in ward ${params.wardId}`);
  if (event.type === 'MeetingCreated' && (event.meetingDate !== meeting.meeting_date || event.meetingType !== meeting.meeting_type)) {
    throw new Error(`Core event ${row.id} does not match its persisted meeting`);
  }

  const settingsResult = await client.query(
    `SELECT module_id, enabled
       FROM ward_module_enablement
      WHERE ward_id = $1::uuid
        AND ward_id = app.current_ward_id()`,
    [params.wardId]
  );
  const overrides = new Map((settingsResult.rows as Array<{ module_id: string; enabled: boolean }>).map((setting) => [setting.module_id, setting.enabled]));
  const enabled = new Map(buildEffectiveModuleSettings(DEFAULT_MODULE_REGISTRY, overrides).map((setting) => [setting.id, setting.enabled]));

  await client.query(
    `UPDATE event_outbox
        SET status = 'processing', attempts = attempts + 1, updated_at = now()
      WHERE id = $1::uuid AND ward_id = $2::uuid`,
    [row.id, params.wardId]
  );

  await dispatchCoreEvent(event, params.wardId, DEFAULT_MODULE_REGISTRY, (wardId, moduleId) => wardId === params.wardId && (enabled.get(moduleId) ?? false));

  await client.query(
    `UPDATE event_outbox
        SET status = 'processed', last_error = NULL, updated_at = now()
      WHERE id = $1::uuid AND ward_id = $2::uuid`,
    [row.id, params.wardId]
  );
}

export async function recordCoreEventOutboxFailure(
  client: DbClient,
  params: { wardId: string; eventOutboxId: string; errorMessage: string }
): Promise<void> {
  await client.query(
    `UPDATE event_outbox
        SET attempts = attempts + 1,
            status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
            available_at = CASE WHEN attempts + 1 >= 5 THEN available_at ELSE now() + interval '60 seconds' END,
            last_error = $3::text,
            updated_at = now()
      WHERE id = $1::uuid
        AND ward_id = $2::uuid`,
    [params.eventOutboxId, params.wardId, params.errorMessage]
  );
}
