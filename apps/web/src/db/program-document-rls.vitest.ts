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

describe('Programs document RLS', () => {
  it.skipIf(!shouldRun)('isolates baptism documents by ward for reads and writes', () => {
    const sql = String.raw`
BEGIN;
TRUNCATE TABLE program_document, ward, stake RESTART IDENTITY CASCADE;
DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  user_id UUID;
  role_id UUID;
  visible_a INTEGER;
  visible_b INTEGER;
  cross_write_failed BOOLEAN := false;
BEGIN
  INSERT INTO stake (name) VALUES ('Programs Persistence Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Programs Ward A', 'A') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Programs Ward B', 'B') RETURNING id INTO ward_b;
  INSERT INTO user_account (email) VALUES ('programs-rls@example.test') RETURNING id INTO user_id;
  INSERT INTO role (name, scope) VALUES ('PROGRAMS_RLS_TEST_ACTOR', 'WARD') RETURNING id INTO role_id;
  PERFORM set_config('app.user_id', user_id::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_a, user_id, role_id);

  INSERT INTO program_source_event (ward_id, source_type, source_id, source_version, source_json)
  VALUES (ward_a, 'BAPTISM_EVENT', 'event-a', '1', '{"wardId":"ward-a"}'::jsonb);
  INSERT INTO program_document (ward_id, program_type, source_type, source_id, schema_version, document_json)
  VALUES (ward_a, 'BAPTISM_PROGRAM', 'BAPTISM_EVENT', 'event-a', 1, '{"programType":"BAPTISM_PROGRAM"}'::jsonb);
  SELECT count(*) INTO visible_a FROM program_document;

  PERFORM set_config('app.ward_id', ward_b::text, true);
  SELECT count(*) INTO visible_b FROM program_document;
  BEGIN
    INSERT INTO program_document (ward_id, program_type, source_type, source_id, schema_version, document_json)
    VALUES (ward_a, 'BAPTISM_PROGRAM', 'BAPTISM_EVENT', 'cross-write', 1, '{"programType":"BAPTISM_PROGRAM"}'::jsonb);
  EXCEPTION WHEN others THEN
    cross_write_failed := true;
  END;

  IF visible_a <> 1 THEN RAISE EXCEPTION 'own ward could not read its document'; END IF;
  IF visible_b <> 0 THEN RAISE EXCEPTION 'other ward read a baptism document'; END IF;
  IF NOT cross_write_failed THEN RAISE EXCEPTION 'other ward write was not rejected'; END IF;
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
