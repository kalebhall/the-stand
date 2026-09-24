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

describe('dashboard layout preference RLS', () => {
  it.skipIf(!shouldRun)('isolates preferences by active ward and user', () => {
    const sql = String.raw`
BEGIN;
TRUNCATE TABLE dashboard_layout_preference, ward_user_role, role, user_account, ward, stake RESTART IDENTITY CASCADE;

DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  user_a UUID;
  user_b UUID;
  role_id UUID;
  visible_a INTEGER;
  visible_b INTEGER;
  cross_user_visible INTEGER;
BEGIN
  INSERT INTO stake (name) VALUES ('Dashboard Layout Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Dashboard Ward A', 'A') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Dashboard Ward B', 'B') RETURNING id INTO ward_b;
  INSERT INTO user_account (email) VALUES ('dashboard-a@example.test') RETURNING id INTO user_a;
  INSERT INTO user_account (email) VALUES ('dashboard-b@example.test') RETURNING id INTO user_b;
  INSERT INTO role (name, scope) VALUES ('DASHBOARD_LAYOUT_TEST_ACTOR', 'WARD') RETURNING id INTO role_id;

  PERFORM set_config('app.user_id', user_a::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_a, user_a, role_id);
  INSERT INTO dashboard_layout_preference (ward_id, user_id, card_order) VALUES (ward_a, user_a, '["draft-count"]'::jsonb);

  SELECT count(*) INTO visible_a FROM dashboard_layout_preference;
  PERFORM set_config('app.ward_id', ward_b::text, true);
  SELECT count(*) INTO visible_b FROM dashboard_layout_preference;
  PERFORM set_config('app.user_id', user_b::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  SELECT count(*) INTO cross_user_visible FROM dashboard_layout_preference;

  IF visible_a <> 1 THEN RAISE EXCEPTION 'owner could not see dashboard preference'; END IF;
  IF visible_b <> 0 THEN RAISE EXCEPTION 'other ward saw dashboard preference'; END IF;
  IF cross_user_visible <> 0 THEN RAISE EXCEPTION 'other user saw dashboard preference'; END IF;
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
