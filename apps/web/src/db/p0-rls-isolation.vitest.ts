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

describe('P0 ward RLS isolation', () => {
  it.skipIf(!shouldRun)('rejects cross-ward reads and writes for three protected tables', () => {
    const sql = String.raw`
BEGIN;
TRUNCATE TABLE member, announcement, calling_assignment, ward, stake RESTART IDENTITY CASCADE;

DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  visible_members INTEGER;
  visible_announcements INTEGER;
  visible_assignments INTEGER;
  member_write_rejected BOOLEAN := false;
  announcement_write_rejected BOOLEAN := false;
  assignment_write_rejected BOOLEAN := false;
BEGIN
  INSERT INTO stake (name) VALUES ('P0 RLS Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'P0 Ward A', 'A') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'P0 Ward B', 'B') RETURNING id INTO ward_b;

  PERFORM set_config('app.user_id', gen_random_uuid()::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO member (ward_id, full_name) VALUES (ward_a, 'Ward A Member');
  INSERT INTO announcement (ward_id, title, body) VALUES (ward_a, 'Ward A Announcement', 'A');
  INSERT INTO calling_assignment (ward_id, member_name, calling_name) VALUES (ward_a, 'Ward A Member', 'Teacher');

  PERFORM set_config('app.ward_id', ward_b::text, true);
  SELECT count(*) INTO visible_members FROM member;
  SELECT count(*) INTO visible_announcements FROM announcement;
  SELECT count(*) INTO visible_assignments FROM calling_assignment;

  BEGIN
    INSERT INTO member (ward_id, full_name) VALUES (ward_a, 'Cross-Ward Member');
  EXCEPTION WHEN insufficient_privilege THEN
    member_write_rejected := true;
  END;

  BEGIN
    INSERT INTO announcement (ward_id, title, body) VALUES (ward_a, 'Cross-Ward Announcement', 'blocked');
  EXCEPTION WHEN insufficient_privilege THEN
    announcement_write_rejected := true;
  END;

  BEGIN
    INSERT INTO calling_assignment (ward_id, member_name, calling_name) VALUES (ward_a, 'Cross-Ward Member', 'Blocked');
  EXCEPTION WHEN insufficient_privilege THEN
    assignment_write_rejected := true;
  END;

  IF visible_members <> 0 THEN
    RAISE EXCEPTION 'ward B saw ward A member rows: %', visible_members;
  END IF;
  IF visible_announcements <> 0 THEN
    RAISE EXCEPTION 'ward B saw ward A announcement rows: %', visible_announcements;
  END IF;
  IF visible_assignments <> 0 THEN
    RAISE EXCEPTION 'ward B saw ward A assignment rows: %', visible_assignments;
  END IF;
  IF NOT member_write_rejected OR NOT announcement_write_rejected OR NOT assignment_write_rejected THEN
    RAISE EXCEPTION 'at least one cross-ward write was not rejected';
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
