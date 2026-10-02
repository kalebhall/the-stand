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

describe('Reusable block library PostgreSQL RLS', () => {
  it.skipIf(!shouldRun)('enforces ward isolation, immutable scope, creator identity, and sequential versions', () => {
    const sql = String.raw`
BEGIN;
TRUNCATE TABLE reusable_block, ward_user_role, role, user_account, ward, stake RESTART IDENTITY CASCADE;
DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  user_a UUID;
  role_id UUID;
  support_role_id UUID;
  block_id UUID;
  visible_rows INTEGER;
  rejected BOOLEAN := false;
BEGIN
  INSERT INTO stake (name) VALUES ('Reusable Block RLS Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Reusable Block Ward A', 'RBA') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Reusable Block Ward B', 'RBB') RETURNING id INTO ward_b;
  INSERT INTO user_account (email) VALUES ('reusable-block-rls@example.test') RETURNING id INTO user_a;
  INSERT INTO role (name, scope) VALUES ('REUSABLE_BLOCK_RLS_ACTOR', 'WARD') RETURNING id INTO role_id;
  INSERT INTO role (name, scope) VALUES ('SUPPORT_ADMIN', 'GLOBAL') RETURNING id INTO support_role_id;
  INSERT INTO user_global_role (user_id, role_id) VALUES (user_a, support_role_id);
  PERFORM set_config('app.user_id', user_a::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_a, user_a, role_id);

  INSERT INTO reusable_block (scope_type, scope_id, owner_user_id, block_type, name, created_by_user_id)
    VALUES ('WARD', ward_a, NULL, 'DIVIDER', 'Ward divider', gen_random_uuid()) RETURNING id INTO block_id;
  INSERT INTO reusable_block_version (reusable_block_id, version, snapshot_json, created_by_user_id)
    VALUES (block_id, 1, '{"type":"DIVIDER"}', gen_random_uuid());
  IF (SELECT current_version FROM reusable_block WHERE id = block_id) <> 1 THEN
    RAISE EXCEPTION 'current_version did not advance';
  END IF;
  IF (SELECT created_by_user_id FROM reusable_block WHERE id = block_id) <> user_a THEN
    RAISE EXCEPTION 'block creator was not derived from context';
  END IF;
  IF (SELECT created_by_user_id FROM reusable_block_version WHERE reusable_block_id = block_id) <> user_a THEN
    RAISE EXCEPTION 'version creator was not derived from context';
  END IF;

  BEGIN
    INSERT INTO reusable_block_version (reusable_block_id, version, snapshot_json) VALUES (block_id, 3, '{"type":"DIVIDER"}');
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'version gap was accepted'; END IF;

  rejected := false;
  BEGIN
    UPDATE reusable_block SET scope_type = 'PERSONAL', owner_user_id = user_a WHERE id = block_id;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'scope mutation was accepted'; END IF;

  PERFORM set_config('app.ward_id', ward_b::text, true);
  SELECT count(*) INTO visible_rows FROM reusable_block;
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'cross-ward reusable block was visible'; END IF;
END;
$$;
ROLLBACK;
`;
    expect(() => execFileSync('psql', [dbUrl as string, '--set', 'ON_ERROR_STOP=1', '--quiet', '--no-psqlrc', '--file', '-'], { input: sql, stdio: 'pipe' })).not.toThrow();
  });
});
