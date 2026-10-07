import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

function loadTestEnv() {
  const envPath = path.resolve(process.cwd(), '../../.env.test');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadTestEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.E2E_FIXTURES_ALLOWED !== '1' || !testDatabaseUrl || process.env.DATABASE_URL !== testDatabaseUrl) {
  throw new Error('E2E cleanup requires explicit E2E_FIXTURES_ALLOWED=1 and DATABASE_URL to exactly match TEST_DATABASE_URL');
}

const [meetingId] = process.argv.slice(2);
if (!meetingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(meetingId)) {
  throw new Error('E2E cleanup requires one UUID meeting id');
}

const wardId = '11111111-1111-4111-8111-111111111111';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
const client = await pool.connect();
let clientReleased = false;
try {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
  await client.query(`SELECT set_config('app.ward_id', $1, true)`, [wardId]);

  const meeting = await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid FOR UPDATE', [meetingId, wardId]);
  if (meeting.rowCount !== 1) throw new Error(`E2E meeting not found in fixture ward: ${meetingId}`);
  const programItems = await client.query('SELECT id FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid', [
    meetingId,
    wardId
  ]);
  const programItemIds = programItems.rows.map((row) => row.id);
  const internalNotes = await client.query(
    `SELECT id
       FROM internal_note
      WHERE ward_id = $1::uuid
        AND (meeting_id = $2::uuid OR program_item_id = ANY($3::uuid[]))`,
    [wardId, meetingId, programItemIds]
  );
  const internalNoteIds = internalNotes.rows.map((row) => row.id);

  await client.query('DELETE FROM public_program_share WHERE meeting_id = $1::uuid AND ward_id = $2::uuid', [meetingId, wardId]);
  const scopedOutbox = `
    SELECT id FROM event_outbox
     WHERE ward_id = $1::uuid
       AND (
         (aggregate_type = 'meeting' AND aggregate_id = $2::uuid)
         OR payload->>'meetingId' = $2::text
         OR (aggregate_type = 'internal_note' AND aggregate_id = ANY($3::uuid[]))
       )`;
  await client.query(`DELETE FROM notification_delivery WHERE ward_id = $1::uuid AND event_outbox_id IN (${scopedOutbox})`, [
    wardId,
    meetingId,
    internalNoteIds
  ]);
  await client.query(`DELETE FROM notification_email_digest_item WHERE ward_id = $1::uuid AND event_outbox_id IN (${scopedOutbox})`, [
    wardId,
    meetingId,
    internalNoteIds
  ]);
  await client.query(`DELETE FROM event_outbox WHERE id IN (${scopedOutbox})`, [wardId, meetingId, internalNoteIds]);
  await client.query('ALTER TABLE public.meeting_program_render DISABLE TRIGGER meeting_program_render_published_delete_protected');
  try {
    await client.query('DELETE FROM meeting_program_render WHERE meeting_id = $1::uuid AND ward_id = $2::uuid', [meetingId, wardId]);
  } finally {
    await client.query('ALTER TABLE public.meeting_program_render ENABLE TRIGGER meeting_program_render_published_delete_protected');
  }
  await client.query(
    `DELETE FROM audit_log
      WHERE ward_id = $1::uuid
        AND (
          entity_id = $2::text
          OR details->>'meetingId' = $2::text
          OR details->>'programItemId' = ANY($3::text[])
          OR entity_id = ANY($4::text[])
        )`,
    [wardId, meetingId, programItemIds, internalNoteIds]
  );
  await client.query('DELETE FROM offline_mutation WHERE meeting_id = $1::uuid AND ward_id = $2::uuid', [meetingId, wardId]);
  await client.query('DELETE FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid', [meetingId, wardId]);
  await client.query('COMMIT');

  client.release();
  clientReleased = true;
  const verificationClient = await pool.connect();
  try {
    await verificationClient.query('BEGIN');
    await verificationClient.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    await verificationClient.query(`SELECT set_config('app.ward_id', $1, true)`, [wardId]);
    const remaining = await verificationClient.query(
      `SELECT
         (SELECT count(*) FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid)::int AS meetings,
         (SELECT count(*) FROM meeting_program_render WHERE meeting_id = $1::uuid AND ward_id = $2::uuid)::int AS renders,
         (SELECT count(*) FROM public_program_share WHERE meeting_id = $1::uuid AND ward_id = $2::uuid)::int AS shares,
         (SELECT count(*) FROM event_outbox WHERE ward_id = $2::uuid AND ((aggregate_type = 'meeting' AND aggregate_id = $1::uuid) OR payload->>'meetingId' = $1::text OR (aggregate_type = 'internal_note' AND aggregate_id = ANY($3::uuid[]))))::int AS outbox,
         (SELECT count(*) FROM notification_delivery WHERE ward_id = $2::uuid AND event_outbox_id IN (SELECT id FROM event_outbox WHERE ward_id = $2::uuid AND ((aggregate_type = 'meeting' AND aggregate_id = $1::uuid) OR payload->>'meetingId' = $1::text OR (aggregate_type = 'internal_note' AND aggregate_id = ANY($3::uuid[])))))::int AS notification_deliveries,
         (SELECT count(*) FROM notification_email_digest_item WHERE ward_id = $2::uuid AND event_outbox_id IN (SELECT id FROM event_outbox WHERE ward_id = $2::uuid AND ((aggregate_type = 'meeting' AND aggregate_id = $1::uuid) OR payload->>'meetingId' = $1::text OR (aggregate_type = 'internal_note' AND aggregate_id = ANY($3::uuid[])))))::int AS digest_items,
         (SELECT count(*) FROM audit_log WHERE ward_id = $2::uuid AND (entity_id = $1::text OR details->>'meetingId' = $1::text OR details->>'programItemId' = ANY($4::text[]) OR entity_id = ANY($5::text[])))::int AS audit_rows,
         (SELECT count(*) FROM offline_mutation WHERE ward_id = $2::uuid AND meeting_id = $1::uuid)::int AS offline_mutations`,
      [meetingId, wardId, internalNoteIds, programItemIds, internalNoteIds]
    );
    await verificationClient.query('COMMIT');
    const row = remaining.rows[0] ?? {};
    const leftovers = Object.entries(row).filter(([, value]) => Number(value) !== 0);
    if (leftovers.length) throw new Error(`E2E cleanup verification failed: ${JSON.stringify(Object.fromEntries(leftovers))}`);
  } catch (error) {
    await verificationClient.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    verificationClient.release();
  }
  console.log(`cleaned E2E meeting ${meetingId}`);
} catch (error) {
  if (!clientReleased) await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  if (!clientReleased) client.release();
  await pool.end();
}
