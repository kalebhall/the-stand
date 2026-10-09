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

describe('document designer RLS isolation', () => {
  it.skipIf(!shouldRun)('isolates meeting documents and ward settings by current ward', () => {
    const sql = String.raw`
BEGIN;
-- The database is provisioned by the migration setup before this test runs.
SET LOCAL row_security = on;
TRUNCATE TABLE meeting_document, ward_document_settings, document_template_version, document_template, meeting, ward, stake RESTART IDENTITY CASCADE;
CREATE TEMP TABLE rls_fixture (ward_a UUID, ward_b UUID, user_a UUID, meeting_a UUID);

DO $$
DECLARE
  stake_id UUID;
  ward_a UUID;
  ward_b UUID;
  meeting_a UUID;
  user_a UUID;
  role_id UUID;
BEGIN
  INSERT INTO stake (name) VALUES ('Designer Stake') RETURNING id INTO stake_id;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Designer Ward A', 'A') RETURNING id INTO ward_a;
  INSERT INTO ward (stake_id, name, unit_number) VALUES (stake_id, 'Designer Ward B', 'B') RETURNING id INTO ward_b;
  INSERT INTO user_account (email) VALUES ('designer@example.test') RETURNING id INTO user_a;
  INSERT INTO role (name, scope) VALUES ('STAND_ADMIN', 'WARD') ON CONFLICT (name) DO UPDATE SET scope = EXCLUDED.scope RETURNING id INTO role_id;
  PERFORM set_config('app.user_id', user_a::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES (ward_a, user_a, role_id);
  INSERT INTO meeting (ward_id, meeting_date, meeting_type) VALUES (ward_a, '2026-09-20', 'SACRAMENT') RETURNING id INTO meeting_a;
  INSERT INTO meeting_document (ward_id, meeting_id, document_type, schema_version, layout_json, theme_json, updated_by_user_id)
  VALUES (ward_a, meeting_a, 'SACRAMENT_PROGRAM', 1, '{"schemaVersion": 1}'::jsonb, '{}'::jsonb, user_a);
  INSERT INTO ward_document_settings (ward_id, allow_advanced_program_designer, updated_by_user_id)
  VALUES (ward_a, false, user_a);
  INSERT INTO rls_fixture (ward_a, ward_b, user_a, meeting_a) VALUES (ward_a, ward_b, user_a, meeting_a);
END;
$$;

DO $$
DECLARE visible_count INTEGER;
BEGIN
  SELECT count(*) INTO visible_count FROM meeting_document;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'ward A expected one document, got %', visible_count; END IF;
END;
$$;

SELECT set_config('app.ward_id', ward_b::text, false) FROM rls_fixture;

DO $$
DECLARE hidden_count INTEGER;
BEGIN
  SELECT count(*) INTO hidden_count FROM meeting_document;
  IF hidden_count <> 0 THEN RAISE EXCEPTION 'ward B expected zero documents, got %', hidden_count; END IF;
END;
$$;
DO $$
DECLARE
  global_user UUID;
  global_role UUID;
  stake_role UUID;
  system_template UUID;
  system_version UUID;
  stake_template UUID;
  stake_version UUID;
  stake_version_two UUID;
  ward_template UUID;
  ward_version UUID;
  ward_a UUID;
  stake_a UUID;
  user_a UUID;
  user_b UUID;
  assignment_b UUID;
  assignment_a UUID;
  changed_count INTEGER;
BEGIN
  SELECT rls_fixture.ward_a, rls_fixture.user_a INTO ward_a, user_a FROM rls_fixture;
  SELECT stake_id INTO stake_a FROM ward WHERE id = ward_a;
  INSERT INTO user_account (email) VALUES ('global-template-admin@example.test') RETURNING id INTO global_user;
  INSERT INTO role (name, scope) VALUES ('SYSTEM_ADMIN', 'GLOBAL')
    ON CONFLICT (name) DO UPDATE SET scope = EXCLUDED.scope
    RETURNING id INTO global_role;
  INSERT INTO role (name, scope) VALUES ('STAKE_ADMIN', 'STAKE')
    ON CONFLICT (name) DO UPDATE SET scope = EXCLUDED.scope
    RETURNING id INTO stake_role;
  INSERT INTO user_global_role (user_id, role_id) VALUES (global_user, global_role);
  INSERT INTO user_account (email) VALUES ('stake-template-user@example.test') RETURNING id INTO user_b;

  PERFORM set_config('app.user_id', global_user::text, true);
  PERFORM set_config('app.ward_id', '', true);
  INSERT INTO stake_user_role (stake_id, user_id, role_id, granted_by_user_id)
    VALUES (stake_a, user_a, stake_role, global_user)
    RETURNING id INTO assignment_a;
  INSERT INTO stake_user_role (stake_id, user_id, role_id, granted_by_user_id)
    VALUES (stake_a, user_b, stake_role, global_user)
    RETURNING id INTO assignment_b;
  INSERT INTO document_template (scope_type, scope_id, document_type, name, status)
    VALUES ('SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Global system template', 'DRAFT')
    RETURNING id INTO system_template;
  INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json)
    VALUES (system_template, 1, 1, '{"schemaVersion": 1}'::jsonb, '{}'::jsonb)
    RETURNING id INTO system_version;
  UPDATE document_template
     SET status = 'PUBLISHED', current_published_version_id = system_version, published_at = now()
   WHERE id = system_template;

  PERFORM set_config('app.user_id', user_a::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  IF NOT (SELECT app.is_stake_admin(stake_a)) THEN
    RAISE EXCEPTION 'same-stake user must be recognized as stake admin';
  END IF;
  UPDATE stake_user_role
     SET revoked_at = now()
   WHERE id = assignment_b AND stake_id = stake_a;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 1 THEN
    RAISE EXCEPTION 'same-stake stake admin must update another user assignment';
  END IF;
  IF (SELECT count(*) FROM stake_admin_access WHERE assignment_id = assignment_b) <> 0 THEN
    RAISE EXCEPTION 'revoked stake-admin assignment must be removed from projection';
  END IF;
  DELETE FROM stake_user_role
   WHERE id = assignment_b AND stake_id = stake_a;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 1 THEN
    RAISE EXCEPTION 'same-stake stake admin must delete another user assignment';
  END IF;
  INSERT INTO document_template (scope_type, scope_id, document_type, name, status, created_by_user_id)
    VALUES ('WARD', ward_a, 'SACRAMENT_PROGRAM', 'Private ward template', 'DRAFT', user_a)
    RETURNING id INTO ward_template;
  INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, created_by_user_id)
    VALUES (ward_template, 1, 1, '{"schemaVersion": 1}'::jsonb, '{}'::jsonb, user_a)
    RETURNING id INTO ward_version;
  INSERT INTO document_template (scope_type, scope_id, document_type, name, status, created_by_user_id)
    VALUES ('STAKE', stake_a, 'SACRAMENT_PROGRAM', 'Published stake template', 'DRAFT', user_a)
    RETURNING id INTO stake_template;
  INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, created_by_user_id)
    VALUES (stake_template, 1, 1, '{"schemaVersion": 1}'::jsonb, '{}'::jsonb, user_a)
    RETURNING id INTO stake_version;
  INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, created_by_user_id)
    VALUES (stake_template, 2, 1, '{"schemaVersion": 1, "second": true}'::jsonb, '{}'::jsonb, user_a)
    RETURNING id INTO stake_version_two;
  changed_count := 0;
  BEGIN
    UPDATE document_template_version SET published_at = now() WHERE id = stake_version_two;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    changed_count := -1;
  END;
  IF changed_count <> -1 THEN
    RAISE EXCEPTION 'unpublished template version must not accept a forged publication marker';
  END IF;
  UPDATE document_template
     SET status = 'PUBLISHED', current_published_version_id = stake_version, published_at = now()
   WHERE id = stake_template;
  UPDATE document_template
     SET status = 'PUBLISHED', current_published_version_id = stake_version_two, published_at = now()
   WHERE id = stake_template;
  UPDATE document_template
     SET status = 'ARCHIVED'
   WHERE id = stake_template;
  changed_count := 0;
  BEGIN
    UPDATE document_template_version SET layout_json = '{"schemaVersion": 1, "tampered": true}'::jsonb WHERE id = stake_version;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    changed_count := -1;
  END;
  IF changed_count <> -1 THEN
    RAISE EXCEPTION 'historical published template version must remain immutable after archive';
  END IF;
  changed_count := 0;
  BEGIN
    DELETE FROM document_template_version WHERE id = stake_version;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    changed_count := -1;
  END;
  IF changed_count <> -1 THEN
    RAISE EXCEPTION 'historical published template version must not be deletable';
  END IF;

  IF (SELECT count(*) FROM document_template WHERE id IN (system_template, stake_template, ward_template)) <> 3 THEN
    RAISE EXCEPTION 'authorized ward user must see authorized templates, got %', (SELECT count(*) FROM document_template WHERE id IN (system_template, stake_template, ward_template));
  END IF;
  IF (SELECT count(*) FROM document_template_version WHERE template_id IN (system_template, stake_template, ward_template)) <> 4 THEN
    RAISE EXCEPTION 'authorized ward user must see system, stake, and ward template versions';
  END IF;

  PERFORM set_config('app.user_id', global_user::text, true);
  PERFORM set_config('app.ward_id', '', true);
  INSERT INTO stake_user_role (stake_id, user_id, role_id, granted_by_user_id, granted_at)
    VALUES (stake_a, user_b, stake_role, global_user, now() + interval '1 hour')
    RETURNING id INTO assignment_b;
  PERFORM set_config('app.user_id', user_b::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  IF app.is_stake_admin(stake_a) THEN
    RAISE EXCEPTION 'future stake-admin assignment must not grant access';
  END IF;
  UPDATE user_account SET is_active = false WHERE id = user_a;
  PERFORM set_config('app.user_id', user_a::text, true);
  PERFORM set_config('app.ward_id', ward_a::text, true);
  IF (SELECT count(*) FROM stake_user_role WHERE user_id = user_b) <> 0 THEN
    RAISE EXCEPTION 'inactive stake admin must not read other stake assignments';
  END IF;
  PERFORM set_config('app.user_id', global_user::text, true);
  UPDATE user_account SET is_active = true WHERE id = user_a;
  PERFORM set_config('app.user_id', user_a::text, true);
  changed_count := 0;
  BEGIN
    DELETE FROM stake_admin_access WHERE assignment_id = assignment_b;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    changed_count := -1;
  END;
  IF changed_count > 0 THEN
    RAISE EXCEPTION 'same-stake admin must not directly mutate authorization projection';
  END IF;
  UPDATE stake_user_role SET revoked_at = now() WHERE id = assignment_a;
  IF (SELECT count(*) FROM stake_admin_access WHERE assignment_id = assignment_a) <> 0 THEN
    RAISE EXCEPTION 'self-revoked stake-admin assignment must be removed from projection';
  END IF;
  IF app.is_stake_admin(stake_a) THEN
    RAISE EXCEPTION 'self-revoked stake admin must lose authorization';
  END IF;

  PERFORM set_config('app.user_id', global_user::text, true);
  PERFORM set_config('app.ward_id', '', true);
  IF (SELECT count(*) FROM document_template WHERE id IN (system_template, stake_template, ward_template)) <> 1 THEN
    RAISE EXCEPTION 'global template admin must see only system templates';
  END IF;
  IF (SELECT count(*) FROM document_template_version WHERE template_id = system_template) <> 1 THEN
    RAISE EXCEPTION 'global template admin must see the system template version';
  END IF;
  IF (SELECT count(*) FROM document_template_version WHERE template_id IN (stake_template, ward_template)) <> 0 THEN
    RAISE EXCEPTION 'global template admin must not see stake or ward template versions';
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
