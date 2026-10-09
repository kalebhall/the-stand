import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFile(path.resolve(import.meta.dirname, `../../drizzle/archive/v1/${name}`), 'utf8').then((sql) => sql.toLowerCase());
const readCurrent = (name: string) => readFile(path.resolve(import.meta.dirname, `../../drizzle/${name}`), 'utf8').then((sql) => sql.toLowerCase());
describe('Milestone 9 migrations', () => {
  it('defines explicit stake tenancy and guarded RLS', async () => {
    const sql = await read('0079_stake_template_administration.sql');
    expect(sql).toContain("values ('stake_admin', 'stake')");
    expect(sql.indexOf('add constraint role_scope_check')).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf('add constraint role_scope_check')).toBeLessThan(sql.indexOf("values ('stake_admin', 'stake')"));
    expect(sql).toContain('create table if not exists public.stake_user_role');
    expect(sql).toContain('unique (stake_id, user_id, role_id)');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('force row level security');
    expect(sql).toContain("r.name = 'system_admin'");
    expect(sql).toContain("r.name = 'stake_admin'");
    expect(sql).toContain("r.name in ('system_admin', 'support_admin')");
  });
  it('defines distribution, lineage, lock, scope, and published-read contracts', async () => {
    const sql = await read('0080_template_distribution_and_lock_policy.sql');
    expect(sql).toContain("default 'duplicate_and_customize'");
    expect(sql).toContain("in ('use_as_is', 'duplicate_and_customize', 'required')");
    expect(sql).toContain('source_template_id');
    expect(sql).toContain('document_template_version_lock_json_shape');
    expect(sql).toContain("jsonb_typeof(lock_json) = 'object'");
    expect(sql).toContain('source_template_id <> id');
    expect(sql).toContain("scope_type = 'stake' and status = 'published'");
    expect(sql).toContain('create index if not exists');
    expect(sql).toContain('force row level security');
  });
  it('widens the legacy role scope constraint for stake-scoped roles', async () => {
    const sql = await read('0081_stake_role_scope_constraint.sql');
    expect(sql).toContain('role_scope_check');
    expect(sql).toContain("scope in ('global', 'ward', 'stake')");
    expect(sql).toContain('drop constraint if exists');
    expect(sql).toContain('add constraint role_scope_check');
  });
  it('repairs legacy ward schemas before stake-scoped queries run', async () => {
    const sql = await read('0082_ward_stake_backfill.sql');
    expect(sql).toContain('add column if not exists stake_id');
    expect(sql).toContain('count(*)');
    expect(sql).toContain('stake_count = 1');
    expect(sql).toContain('set stake_id');
    expect(sql).toContain('not null');
    expect(sql).toContain('foreign key');
  });

  it('repairs legacy ward schemas before 0080 creates stake-aware policies', async () => {
    const sql = await read('0080_template_distribution_and_lock_policy.sql');
    expect(sql.indexOf('add column if not exists stake_id')).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf('add column if not exists stake_id')).toBeLessThan(sql.indexOf('create policy document_template_read'));
    expect(sql).toContain('cannot backfill ward.stake_id safely');
  });

  it('restricts global template-admin reads to system templates and preserves template-owned joins', async () => {
    const sql = await readCurrent('0044_scope_document_template_admin_rls.sql');
    expect(sql).toContain('drop policy if exists document_template_read');
    expect(sql).toContain("scope_type = 'system'");
    expect(sql).toContain('scope_id is null');
    expect(sql).toContain('app.can_administer_system_templates');
    expect(sql).toContain('drop policy if exists document_template_version_read');
    expect(sql).toContain('t.id = document_template_version.template_id');
    expect(sql).not.toMatch(/or\s+app\.can_administer_system_templates\(\)/);
  });

  it('keeps stake-admin authorization compatible with FORCE RLS in one atomic migration', async () => {
    const sql = await readCurrent('0045_stake_admin_force_rls.sql');
    expect(sql).toContain('alter function app.is_stake_admin(uuid) set row_security = on');
    expect(sql).toContain('drop policy if exists stake_user_role_read');
    expect(sql).toContain('drop policy if exists stake_user_role_write');
    expect(sql).toContain('for insert');
    expect(sql).toContain('for update');
    expect(sql).toContain('for delete');
    expect(sql).not.toContain('for all');
  });

  it('preserves same-stake role mutations through a non-recursive authorization projection', async () => {
    const sql = await readCurrent('0046_stake_admin_access_projection.sql');
    expect(sql).toContain('create table if not exists public.stake_admin_access');
    expect(sql).toContain('alter table public.stake_user_role no force row level security');
    expect(sql).toContain('alter table public.stake_user_role force row level security');
    expect(sql).toContain('create or replace function app.is_stake_admin');
    expect(sql).toContain('create or replace function app.sync_stake_admin_access');
    expect(sql).toContain('create trigger stake_admin_access_validate');
    expect(sql).toContain('alter table public.stake_admin_access force row level security');
  });

  it('hardens projection activity, template capability boundaries, authorship, and publication history', async () => {
    const sql = await readCurrent('0047_template_boundary_hardening.sql');
    expect(sql).toContain('u.is_active = true');
    expect(sql).toContain('create or replace function app.can_manage_ward_program_templates');
    expect(sql).toContain('app.has_active_ward_access');
    expect(sql).toContain("created_by_user_id = app.current_user_id()");
    expect(sql).toContain('alter table public.stake_admin_access force row level security');
    expect(sql).toContain('create policy stake_admin_access_read');
    expect(sql).toContain('add column if not exists published_at');
    expect(sql).toContain('document_template_mark_published_version');
    expect(sql).toContain('create or replace function app.bind_template_version_author');
    expect(sql).toContain('drop policy if exists document_template_version_write');
  });

  it('defines a narrowly scoped RLS-safe auth assignment reader', async () => {
    const sql = await read('0083_auth_ward_assignments.sql');
    expect(sql).toContain('returns table');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, public');
    expect(sql).toContain('set row_security = off');
    expect(sql).toContain('app.current_user_id()');
    expect(sql).toContain('grant execute');
    expect(sql).toContain('revoke all on function app.load_user_ward_access(uuid) from public');
    expect(sql).not.toContain('grant execute on function app.load_user_ward_access(uuid) to current_user');
    expect(sql).toContain("rolname = 'stand_user'");
    expect(sql).toContain('to stand_user');
    expect(sql).not.toContain('grant execute on function app.load_user_ward_access(uuid) to public');
  });

  it('avoids recursive stake-role policy evaluation and validates lineage/publication pairs', async () => {
    const stakeSql = await read('0079_stake_template_administration.sql');
    const templateSql = await read('0080_template_distribution_and_lock_policy.sql');
    expect(stakeSql).toContain('security definer');
    expect(stakeSql).toContain('set row_security = off');
    expect(stakeSql).toContain('u.id = app.current_user_id()');
    expect(stakeSql).toContain('user_id = app.current_user_id()');
    expect(stakeSql).toContain('app.can_administer_system_templates');
    expect(templateSql).toContain('document_template_publication_consistency_check');
    expect(templateSql).toContain('document_template_current_published_version_fk');
    expect(templateSql).toContain('document_template_source_fk');
    expect(templateSql).toContain('validate_document_template_lineage');
    expect(templateSql).toContain("source_template.status = 'published'");
    expect(templateSql).toContain('document_template_version_version_positive');
  });
});
