import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { insertCoreEventOutboxEvent } from './outbox';

const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRun = Boolean(dbUrl);
const pool = shouldRun ? new Pool({ connectionString: dbUrl }) : undefined;

const baseEvent = {
  type: 'MeetingCreated' as const,
  version: 1 as const,
  wardId: '',
  actorId: '22222222-2222-4222-8222-222222222222',
  meetingId: '33333333-3333-4333-8333-333333333333',
  occurredAt: '2024-02-29T12:00:00.000Z',
  meetingDate: '2024-02-29',
  meetingType: 'SACRAMENT'
};

async function createWard(client: PoolClient): Promise<{ wardId: string; userId: string }> {
  const result = await client.query(
    `WITH new_stake AS (
       INSERT INTO stake (name) VALUES ('Core event outbox test stake') RETURNING id
     )
     INSERT INTO ward (stake_id, name, unit_number)
     SELECT id, 'Core event outbox test ward', 'CORE-OUTBOX'
     FROM new_stake
     RETURNING id`
  );
  const wardId = (result.rows[0] as { id: string }).id;
  const userResult = await client.query("INSERT INTO user_account (email) VALUES ('core-event-outbox-test-' || gen_random_uuid()::text || '@example.com') RETURNING id");
  const userId = (userResult.rows[0] as { id: string }).id;
  const roleResult = await client.query("INSERT INTO role (name, scope) VALUES ('CORE_EVENT_OUTBOX_TEST_ACTOR_' || gen_random_uuid()::text, 'WARD') RETURNING id");
  const roleId = (roleResult.rows[0] as { id: string }).id;
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.ward_id', $2, true)", [userId, wardId]);
  await client.query('INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES ($1::uuid, $2::uuid, $3::uuid)', [wardId, userId, roleId]);
  return { wardId, userId };
}

async function beginWithWardContext(wardId: string, userId: string): Promise<PoolClient> {
  const client = await pool!.connect();
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.ward_id', $2, true)", [userId, wardId]);
  return client;
}

async function setupWard(): Promise<{ wardId: string; userId: string }> {
  const setup = await pool!.connect();
  try {
    await setup.query('BEGIN');
    const context = await createWard(setup);
    await setup.query('COMMIT');
    return context;
  } finally {
    setup.release();
  }
}

describe('Core event outbox PostgreSQL behavior', () => {
  afterAll(async () => {
    await pool?.end();
  });

  it.skipIf(!shouldRun)('keeps one row for concurrent duplicate insertion attempts', async () => {
    const { wardId, userId } = await setupWard();
    const first = await beginWithWardContext(wardId, userId);
    const second = await beginWithWardContext(wardId, userId);
    const event = { ...baseEvent, wardId, actorId: userId };
    try {
      const firstInsert = insertCoreEventOutboxEvent(first, event);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const secondInsert = insertCoreEventOutboxEvent(second, event);
      const firstId = await firstInsert;
      await first.query('COMMIT');
      const secondId = await secondInsert;
      await second.query('COMMIT');

      expect(firstId).toBe(secondId);
      await first.query('BEGIN');
      await first.query("SELECT set_config('app.user_id', $1, true), set_config('app.ward_id', $2, true)", [userId, wardId]);
      const count = await first.query(
        `SELECT count(*)::text AS count
           FROM event_outbox
          WHERE ward_id = $1::uuid
            AND event_type = 'CORE_MEETING_CREATED'
            AND aggregate_id = $2::uuid`,
        [wardId, event.meetingId]
      );
      expect((count.rows[0] as { count: string }).count).toBe('1');
      await first.query('COMMIT');
    } catch (error) {
      await first.query('ROLLBACK');
      await second.query('ROLLBACK');
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it.skipIf(!shouldRun).each(['processed', 'failed'])('preserves %s terminal state and retry metadata during replay', async (status) => {
    const { wardId, userId } = await setupWard();
    const client = await beginWithWardContext(wardId, userId);
    try {
      const event = { ...baseEvent, wardId, actorId: userId, occurredAt: '2024-02-29T12:00:00.000Z' };
      const inserted = await client.query(
        `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload, status, attempts, last_error)
         VALUES ($1::uuid, 'core_event', $2::uuid, 'CORE_MEETING_CREATED', $3::jsonb, $4::text, 4, 'original failure')
         RETURNING id`,
        [wardId, event.meetingId, JSON.stringify(event), status]
      );

      const replayId = await insertCoreEventOutboxEvent(client, {
        ...event,
        occurredAt: '2024-02-29T13:00:00.000Z'
      });
      const insertedId = (inserted.rows[0] as { id: string }).id;
      const row = await client.query(
        `SELECT payload, status, attempts, last_error
           FROM event_outbox
          WHERE id = $1::uuid`,
        [insertedId]
      );
      const persisted = row.rows[0] as { payload: { occurredAt: string }; status: string; attempts: number; last_error: string };
      await client.query('COMMIT');

      expect(replayId).toBe(insertedId);
      expect(persisted).toMatchObject({
        status,
        attempts: 4,
        last_error: 'original failure'
      });
      expect(persisted.payload).toMatchObject({ occurredAt: '2024-02-29T12:00:00.000Z' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
