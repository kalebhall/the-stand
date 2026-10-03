import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFile(path.resolve(import.meta.dirname, `../../drizzle/${name}`), 'utf8').then((sql) => sql.toLowerCase());

describe('Reusable block library migration', () => {
  it('defines scoped metadata and immutable version storage', async () => {
    const sql = await read('0025_reusable_block_library.sql');
    expect(sql).toContain('create table if not exists public.reusable_block');
    expect(sql).toContain('create table if not exists public.reusable_block_version');
    expect(sql).toContain("scope_type in ('personal', 'ward', 'stake')");
    expect(sql).toContain("block_type in ('custom_text', 'image', 'divider', 'spacer', 'qr_code', 'custom_link')");
    expect(sql).toContain('unique (reusable_block_id, version)');
    expect(sql).toContain("jsonb_typeof(snapshot_json) = 'object'");
  });

  it('enforces ward/stake/personal isolation and immutable versions', async () => {
    const sql = await read('0025_reusable_block_library.sql');
    expect(sql).toContain('force row level security');
    expect(sql).toContain('app.current_ward_id()');
    expect(sql).toContain('app.current_user_id()');
    expect(sql).toContain('app.has_active_ward_access(app.current_ward_id())');
    expect(sql).toContain('app.is_stake_admin(scope_id)');
    expect(sql).toContain('must be the next sequential version');
    expect(sql).toContain('set_reusable_block_creator');
    expect(sql).toContain('prevent_reusable_block_scope_mutation');
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain('prevent_reusable_block_version_mutation');
    expect(sql).toContain('reusable_block_version_immutable');
  });

  it('protects block type, creator, version, and archive invariants', async () => {
    const sql = await read('0026_reusable_block_mutation_hardening.sql');
    expect(sql).toContain('new.block_type is distinct from old.block_type');
    expect(sql).toContain('new.created_by_user_id is distinct from old.created_by_user_id');
    expect(sql).toContain("old.status = 'archived'");
    expect(sql).toContain("using errcode = '55000'");
  });
});
