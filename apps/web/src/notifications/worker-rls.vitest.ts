import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

function hasPsql(): boolean {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRun = Boolean(dbUrl) && hasPsql();

const WORKER_ID = '00000000-0000-0000-0000-000000000000';

describe('notifications worker RLS identity', () => {
  it.skipIf(!shouldRun)('can recover a ward outbox row through the explicit worker assignment', () => {
    const sql = String.raw`
BEGIN;
DO $$
DECLARE
  stake_id UUID;
  v_ward_id UUID;
  v_actor_id UUID;
  v_role_id UUID;
  v_event_id UUID;
  visible_rows INTEGER;
BEGIN
  INSERT INTO stake (name) VALUES ('Worker RLS Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Worker RLS Ward', 'WR') RETURNING id INTO v_ward_id;
  INSERT INTO user_account (email) VALUES ('worker-rls-actor@example.test') RETURNING id INTO v_actor_id;
  INSERT INTO role (name, scope) VALUES ('WORKER_RLS_TEST_ACTOR', 'WARD') RETURNING id INTO v_role_id;
  PERFORM set_config('app.user_id', v_actor_id::text, true);
  PERFORM set_config('app.ward_id', v_ward_id::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (v_ward_id, v_actor_id, v_role_id);
  INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
    VALUES (v_ward_id, 'meeting', gen_random_uuid(), 'CORE_MEETING_CREATED', '{}'::jsonb)
    RETURNING id INTO v_event_id;

  PERFORM set_config('app.user_id', '${WORKER_ID}', true);
  SELECT count(*) INTO visible_rows
    FROM event_outbox eo
   WHERE eo.ward_id = v_ward_id AND eo.id = v_event_id;
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'worker could not see ward outbox row'; END IF;
END;
$$;
ROLLBACK;
`;

    expect(() => execFileSync('psql', [dbUrl as string, '--set', 'ON_ERROR_STOP=1', '--quiet', '--no-psqlrc', '--file', '-'], {
      input: sql,
      stdio: 'pipe'
    })).not.toThrow();
  });
});
