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

describe('module enablement RLS', () => {
  it.skipIf(!shouldRun)('isolates ward overrides and protects Core from disable writes', () => {
    const sql = String.raw`
BEGIN;
TRUNCATE TABLE ward_module_enablement, ward_user_role, role, user_account, ward, stake RESTART IDENTITY CASCADE;

DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  user_a UUID;
  role_id UUID;
  visible_rows INTEGER;
  core_rejected BOOLEAN := false;
  cross_ward_rejected BOOLEAN := false;
BEGIN
  INSERT INTO stake (name) VALUES ('Module Settings Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Module Ward A', 'A') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Module Ward B', 'B') RETURNING id INTO ward_b;
  INSERT INTO user_account (email) VALUES ('module-settings@example.test') RETURNING id INTO user_a;
  INSERT INTO role (name, scope) VALUES ('STAND_ADMIN', 'WARD') RETURNING id INTO role_id;
  PERFORM set_config('app.user_id', user_a::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_a, user_a, role_id);
  INSERT INTO ward_module_enablement (ward_id, module_id, enabled, updated_by_user_id)
    VALUES (ward_a, 'technology-checklist', false, user_a);

  PERFORM set_config('app.ward_id', ward_b::text, true);
  SELECT count(*) INTO visible_rows FROM ward_module_enablement;
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'Ward B saw Ward A module settings'; END IF;

  BEGIN
    INSERT INTO ward_module_enablement (ward_id, module_id, enabled, updated_by_user_id)
      VALUES (ward_a, 'programs', false, user_a);
  EXCEPTION WHEN insufficient_privilege THEN
    cross_ward_rejected := true;
  END;

  PERFORM set_config('app.ward_id', ward_a::text, true);
  BEGIN
    INSERT INTO ward_module_enablement (ward_id, module_id, enabled, updated_by_user_id)
      VALUES (ward_a, 'conducting-core', false, user_a);
  EXCEPTION WHEN check_violation THEN
    core_rejected := true;
  END;

  IF NOT cross_ward_rejected OR NOT core_rejected THEN
    RAISE EXCEPTION 'module enablement protection failed';
  END IF;
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
