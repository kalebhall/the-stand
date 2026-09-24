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
  INSERT INTO role (name, scope) VALUES ('STAND_ADMIN', 'WARD') RETURNING id INTO role_id;
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

SELECT set_config('app.ward_id', ward_b::text, true) FROM rls_fixture;

DO $$
DECLARE hidden_count INTEGER;
BEGIN
  SELECT count(*) INTO hidden_count FROM meeting_document;
  IF hidden_count <> 0 THEN RAISE EXCEPTION 'ward B expected zero documents, got %', hidden_count; END IF;
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
