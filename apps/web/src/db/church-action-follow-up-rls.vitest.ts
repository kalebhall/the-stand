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

describe('church action follow-up RLS', () => {
  it.skipIf(!shouldRun)('isolates follow-ups by ward and rejects cross-ward writes', () => {
    const sql = String.raw`
BEGIN;
TRUNCATE TABLE church_action_follow_up, calling_action, calling_assignment, ward_user_role, role, user_account, ward, stake RESTART IDENTITY CASCADE;

DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  user_a UUID;
  role_id UUID;
  calling_id UUID;
  visible_rows INTEGER;
  write_rejected BOOLEAN := false;
BEGIN
  INSERT INTO stake (name) VALUES ('Action Follow-Up Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Action Ward A', 'A') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Action Ward B', 'B') RETURNING id INTO ward_b;
  INSERT INTO user_account (email) VALUES ('action-follow-up@example.test') RETURNING id INTO user_a;
  INSERT INTO role (name, scope) VALUES ('STAND_ADMIN', 'WARD') RETURNING id INTO role_id;
  PERFORM set_config('app.user_id', user_a::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_a, user_a, role_id);
  INSERT INTO calling_assignment (ward_id, member_name, calling_name) VALUES (ward_a, 'Action Member', 'Teacher') RETURNING id INTO calling_id;
  INSERT INTO church_action_follow_up (
    ward_id, family, action_type, member_name, calling_assignment_id,
    source_event, source_event_id, description
  ) VALUES (
    ward_a, 'CALLING', 'CALLING_SET_APART_RECORDING', 'Action Member', calling_id,
    'CALLING_SET_APART', calling_id, 'Record set apart in LCR'
  );

  PERFORM set_config('app.ward_id', ward_b::text, true);
  SELECT count(*) INTO visible_rows FROM church_action_follow_up;
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'ward B saw ward A follow-ups: %', visible_rows;
  END IF;

  BEGIN
    INSERT INTO church_action_follow_up (
      ward_id, family, action_type, member_name, calling_assignment_id,
      source_event, source_event_id, description
    ) VALUES (
      ward_a, 'CALLING', 'CALLING_RELEASE_RECORDING', 'Cross-Ward Member', calling_id,
      'CALLING_RELEASE', calling_id, 'Record release in LCR'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    write_rejected := true;
  END;

  IF NOT write_rejected THEN
    RAISE EXCEPTION 'cross-ward follow-up write was not rejected';
  END IF;
END;
$$;
ROLLBACK;
`;

    expect(() => {
      execFileSync('psql', [dbUrl as string, '--set', 'ON_ERROR_STOP=1', '--quiet', '--no-psqlrc', '--file', '-'], {
        cwd: process.cwd(),
        input: sql,
        stdio: 'pipe'
      });
    }).not.toThrow();
  });
});