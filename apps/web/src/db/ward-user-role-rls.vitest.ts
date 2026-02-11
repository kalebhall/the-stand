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

describe('ward_user_role RLS isolation', () => {
  it.skipIf(!shouldRun)('returns only rows for current ward context', () => {
    const sql = String.raw`
BEGIN;
\i drizzle/0000_init.sql
TRUNCATE TABLE ward_user_role, role, user_account, ward, stake RESTART IDENTITY CASCADE;

DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  user_a UUID;
  user_b UUID;
  role_id UUID;
  count_a INTEGER;
  count_b INTEGER;
  count_none INTEGER;
BEGIN
  INSERT INTO stake (name) VALUES ('Stake 1') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Ward A', '100') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Ward B', '200') RETURNING id INTO ward_b;

  INSERT INTO user_account (email) VALUES ('a@example.com') RETURNING id INTO user_a;
  INSERT INTO user_account (email) VALUES ('b@example.com') RETURNING id INTO user_b;
  INSERT INTO role (name, scope) VALUES ('STAND_ADMIN', 'WARD') RETURNING id INTO role_id;

  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_a, user_a, role_id);

  PERFORM set_config('app.ward_id', ward_b::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_b, user_b, role_id);

  PERFORM set_config('app.ward_id', ward_a::text, true);
  SELECT COUNT(*) INTO count_a FROM ward_user_role;

  PERFORM set_config('app.ward_id', ward_b::text, true);
  SELECT COUNT(*) INTO count_b FROM ward_user_role;

  PERFORM set_config('app.ward_id', gen_random_uuid()::text, true);
  SELECT COUNT(*) INTO count_none FROM ward_user_role;

  IF count_a <> 1 THEN
    RAISE EXCEPTION 'ward A expected 1 row, got %', count_a;
  END IF;

  IF count_b <> 1 THEN
    RAISE EXCEPTION 'ward B expected 1 row, got %', count_b;
  END IF;

  IF count_none <> 0 THEN
    RAISE EXCEPTION 'unknown ward expected 0 rows, got %', count_none;
  END IF;
END;
$$;
ROLLBACK;
`;

    expect(() => {
      execFileSync(
        'psql',
        [
          dbUrl as string,
          '--set',
          'ON_ERROR_STOP=1',
          '--quiet',
          '--no-psqlrc',
          '--file',
          '-'
        ],
        { input: sql, stdio: 'pipe' }
      );
    }).not.toThrow();
  });
});
