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

function psqlEnvironment(connectionUrl: string): NodeJS.ProcessEnv {
  const url = new URL(connectionUrl);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password)
  };
  const parameterEnvNames: Record<string, string> = {
    application_name: 'PGAPPNAME',
    channel_binding: 'PGCHANNELBINDING',
    connect_timeout: 'PGCONNECT_TIMEOUT',
    gssencmode: 'PGGSSENCMODE',
    options: 'PGOPTIONS',
    sslcert: 'PGSSLCERT',
    sslkey: 'PGSSLKEY',
    sslmode: 'PGSSLMODE',
    sslrootcert: 'PGSSLROOTCERT',
    target_session_attrs: 'PGTARGETSESSIONATTRS'
  };
  for (const [parameter, envName] of Object.entries(parameterEnvNames)) {
    const value = url.searchParams.get(parameter);
    if (value !== null) env[envName] = value;
  }
  return env;
}

const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const shouldRun = Boolean(dbUrl) && hasPsql();

describe('P0 ward RLS isolation', () => {
  it.skipIf(!shouldRun)('rejects cross-ward reads and writes for protected ward tables', () => {
    const sql = String.raw`
BEGIN;
TRUNCATE TABLE member, announcement, calling_assignment, public_program_share, public_program_portal, meeting, ward_user_role, role, user_account, ward, stake RESTART IDENTITY CASCADE;

DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  user_a UUID;
  role_id UUID;
  meeting_id UUID;
  meeting_b_id UUID;
  membership_action_a_id UUID;
  visible_members INTEGER;
  visible_announcements INTEGER;
  visible_assignments INTEGER;
  visible_membership_actions INTEGER;
  membership_update_count INTEGER;
  membership_delete_count INTEGER;
  membership_action_write_rejected BOOLEAN := false;
  membership_action_insert_without_context_rejected BOOLEAN := false;
  membership_cross_meeting_rejected BOOLEAN := false;
  membership_rls_enabled BOOLEAN;
  membership_force_rls BOOLEAN;
  member_write_rejected BOOLEAN := false;
  announcement_write_rejected BOOLEAN := false;
  assignment_write_rejected BOOLEAN := false;
BEGIN
  INSERT INTO stake (name) VALUES ('P0 RLS Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'P0 Ward A', 'A') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'P0 Ward B', 'B') RETURNING id INTO ward_b;
  INSERT INTO user_account (email) VALUES ('p0@example.test') RETURNING id INTO user_a;
  INSERT INTO role (name, scope) VALUES ('STAND_ADMIN', 'WARD') RETURNING id INTO role_id;
  PERFORM set_config('app.user_id', user_a::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_a, user_a, role_id);

  INSERT INTO member (ward_id, full_name) VALUES (ward_a, 'Ward A Member');
  INSERT INTO announcement (ward_id, title, body) VALUES (ward_a, 'Ward A Announcement', 'A');
  INSERT INTO calling_assignment (ward_id, member_name, calling_name) VALUES (ward_a, 'Ward A Member', 'Teacher');
  INSERT INTO meeting (ward_id, meeting_date, meeting_type, status) VALUES (ward_a, '2026-09-20', 'SACRAMENT', 'PUBLISHED') RETURNING id INTO meeting_id;
  INSERT INTO meeting_membership_ordinance (ward_id, meeting_id, member_name, action_type)
  VALUES (ward_a, meeting_id, 'Ward A Ordinance', 'WELCOME_NEW_MEMBER')
  RETURNING id INTO membership_action_a_id;
  INSERT INTO public_program_portal (ward_id, token) VALUES (ward_a, 'portal-a');
  INSERT INTO public_program_share (ward_id, meeting_id, token) VALUES (ward_a, meeting_id, 'meeting-a');

  PERFORM set_config('app.ward_id', ward_b::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_b, user_a, role_id);
  INSERT INTO meeting (ward_id, meeting_date, meeting_type, status) VALUES (ward_b, '2026-09-20', 'SACRAMENT', 'PUBLISHED') RETURNING id INTO meeting_b_id;
  INSERT INTO meeting_membership_ordinance (ward_id, meeting_id, member_name, action_type)
  VALUES (ward_b, meeting_b_id, 'Ward B Ordinance', 'WELCOME_NEW_MEMBER');

  SELECT count(*) INTO visible_members FROM member;
  SELECT count(*) INTO visible_announcements FROM announcement;
  SELECT count(*) INTO visible_assignments FROM calling_assignment;
  SELECT count(*) INTO visible_membership_actions FROM meeting_membership_ordinance;

  UPDATE meeting_membership_ordinance SET member_name = 'Cross-Ward Update' WHERE id = membership_action_a_id;
  GET DIAGNOSTICS membership_update_count = ROW_COUNT;
  DELETE FROM meeting_membership_ordinance WHERE id = membership_action_a_id;
  GET DIAGNOSTICS membership_delete_count = ROW_COUNT;

  BEGIN
    INSERT INTO meeting_membership_ordinance (ward_id, meeting_id, member_name, action_type)
    VALUES (ward_a, meeting_id, 'Cross-Ward Ordinance', 'WELCOME_NEW_MEMBER');
  EXCEPTION WHEN insufficient_privilege THEN
    membership_action_write_rejected := true;
  END;

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
  IF visible_membership_actions <> 1 THEN
    RAISE EXCEPTION 'ward B did not see exactly its own membership action: %', visible_membership_actions;
  END IF;
  IF membership_update_count <> 0 OR membership_delete_count <> 0 THEN
    RAISE EXCEPTION 'ward B mutated a ward A membership action (update %, delete %)', membership_update_count, membership_delete_count;
  END IF;
  IF NOT membership_action_write_rejected THEN
    RAISE EXCEPTION 'cross-ward membership action insert was not rejected';
  END IF;
  IF NOT member_write_rejected OR NOT announcement_write_rejected OR NOT assignment_write_rejected THEN
    RAISE EXCEPTION 'at least one cross-ward write was not rejected';
  END IF;

  PERFORM set_config('app.ward_id', ward_a::text, true);
  BEGIN
    INSERT INTO meeting_membership_ordinance (ward_id, meeting_id, member_name, action_type)
    VALUES (ward_a, meeting_b_id, 'Mismatched Meeting Ordinance', 'WELCOME_NEW_MEMBER');
  EXCEPTION WHEN foreign_key_violation THEN
    membership_cross_meeting_rejected := true;
  END;
  IF NOT membership_cross_meeting_rejected THEN
    RAISE EXCEPTION 'ward A membership action referencing a ward B meeting was accepted';
  END IF;
  IF (SELECT count(*) FROM meeting_membership_ordinance WHERE id = membership_action_a_id AND member_name = 'Ward A Ordinance') <> 1 THEN
    RAISE EXCEPTION 'ward A membership action was changed or deleted by ward B';
  END IF;
  PERFORM set_config('app.ward_id', ward_b::text, true);

  SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO membership_rls_enabled, membership_force_rls
    FROM pg_catalog.pg_class c
   WHERE c.oid = 'public.meeting_membership_ordinance'::regclass;
  IF NOT membership_rls_enabled OR NOT membership_force_rls THEN
    RAISE EXCEPTION 'meeting_membership_ordinance is not protected by FORCE RLS';
  END IF;

  PERFORM set_config('app.user_id', '', true);
  PERFORM set_config('app.ward_id', '', true);
  IF (SELECT count(*) FROM meeting_membership_ordinance) <> 0 THEN
    RAISE EXCEPTION 'membership actions were visible without user or ward context';
  END IF;
  BEGIN
    INSERT INTO meeting_membership_ordinance (ward_id, meeting_id, member_name, action_type)
    VALUES (ward_a, meeting_id, 'No-Context Ordinance', 'WELCOME_NEW_MEMBER');
  EXCEPTION WHEN insufficient_privilege THEN
    membership_action_insert_without_context_rejected := true;
  END;
  IF NOT membership_action_insert_without_context_rejected THEN
    RAISE EXCEPTION 'membership action insert without tenant context was not rejected';
  END IF;

  PERFORM set_config('app.public_portal_token', 'portal-a', true);
  IF (SELECT count(*) FROM public_program_portal) <> 1 THEN
    RAISE EXCEPTION 'valid public portal token was rejected';
  END IF;
  IF (SELECT count(*) FROM public_program_share) <> 1 THEN
    RAISE EXCEPTION 'portal token could not read its ward share';
  END IF;
  PERFORM set_config('app.public_portal_token', 'wrong-portal', true);
  IF (SELECT count(*) FROM public_program_portal) <> 0 THEN
    RAISE EXCEPTION 'wrong public portal token was accepted';
  END IF;

  PERFORM set_config('app.public_portal_token', '', true);
  PERFORM set_config('app.public_meeting_token', 'meeting-a', true);
  IF (SELECT count(*) FROM public_program_share) <> 1 THEN
    RAISE EXCEPTION 'valid public meeting token was rejected';
  END IF;
  PERFORM set_config('app.public_meeting_token', 'wrong-meeting', true);
  IF (SELECT count(*) FROM public_program_share) <> 0 THEN
    RAISE EXCEPTION 'wrong public meeting token was accepted';
  END IF;
END;
$$;
ROLLBACK;
`;

    expect(() => {
      execFileSync('psql', ['--no-password', '--set', 'ON_ERROR_STOP=1', '--quiet', '--no-psqlrc', '--file', '-'], {
        cwd: process.cwd(),
        env: psqlEnvironment(dbUrl as string),
        input: sql,
        stdio: 'pipe'
      });
    }).not.toThrow();
  });
});
