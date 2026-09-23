import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(import.meta.dirname, '../../drizzle/archive/v1/0078_publication_history_and_active_pointer.sql');
const priorMigrationPath = path.resolve(import.meta.dirname, '../../drizzle/archive/v1/0077_published_print_input_immutability.sql');

async function readSql(filePath: string): Promise<string> {
  return (await readFile(filePath, 'utf8')).toLowerCase();
}

describe('publication schema migration', () => {
  it('defines publication defaults, nullability, and document constraints', async () => {
    const sql = await readSql(migrationPath);

    for (const column of [
      'document_type',
      'source_template_id',
      'source_template_version',
      'published_by_user_id',
      'published_at',
      'publication_metadata_json',
      'active_render_id',
      'expires_at',
      'updated_at'
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }

    expect(sql).toContain("alter column document_type set default 'sacrament_program'");
    expect(sql).toContain('alter column document_type set not null');
    expect(sql).toContain('alter column published_at set default now()');
    expect(sql).toContain('alter column published_at set not null');
    expect(sql).toContain("alter column publication_metadata_json set default '{}'::jsonb");
    expect(sql).toContain('alter column publication_metadata_json set not null');
    expect(sql).toContain("check (document_type = 'sacrament_program')");
    expect(sql).toContain('meeting_program_render_document_type_check');
    expect(sql).toContain('publication_metadata_json = \'{}\'::jsonb');
  });

  it('preserves identity FKs while requiring a published active render', async () => {
    const sql = await readSql(migrationPath);

    expect(sql).toContain('meeting_program_render_published_by_user_id_fkey');
    expect(sql).toContain('foreign key (published_by_user_id) references public.user_account(id) on delete set null');
    expect(sql).toContain('public_program_share_meeting_same_ward_fk');
    expect(sql).toContain('public_program_share_active_render_same_meeting_ward_fk');
    expect(sql).toContain('on delete restrict');
    expect(sql).toContain('validate_public_program_share_active_render');
    expect(sql).toContain('public_program_share_active_render_published_guard');
    expect(sql).toContain('render.published_at is not null');
    expect(sql).toContain('render.ward_id = new.ward_id');
    expect(sql).toContain('render.meeting_id = new.meeting_id');
    expect(sql).toContain('before insert or update on public.public_program_share');
  });

  it('backfills legacy data and expiration deterministically', async () => {
    const sql = await readSql(migrationPath);

    expect(sql).toContain('where (layout_json is null) <> (render_data_json is null)');
    expect(sql).toMatch(/set layout_json = null,\s+render_data_json = null/);
    expect(sql).toContain('order by r.ward_id, r.meeting_id, r.version desc, r.created_at desc, r.id desc');
    expect(sql).toContain('join public.ward_document_settings');
    expect(sql).toContain('settings.public_program_expiration_days > 0');
    expect(sql).toContain('make_interval(days => settings.public_program_expiration_days)');
    expect(sql).toContain('share.expires_at is null');
  });

  it('guards reruns and protects published historical renders', async () => {
    const sql = await readSql(migrationPath);

    expect(sql).toContain('if not exists (select 1 from pg_constraint');
    expect(sql).toContain('if not exists (select 1 from pg_trigger');
    expect(sql).toContain('create index if not exists');
    expect(sql).toContain('meeting_program_render_published_delete_protected');
    expect(sql).toContain("tg_op = 'delete'");
    expect(sql).toContain('published render cannot be deleted');
    expect(sql).toContain('published render publication metadata is immutable');
    expect(sql).toContain('old.created_at is distinct from new.created_at');
    expect(sql).toContain('disable trigger meeting_program_render_print_inputs_immutable');
    expect(sql).toContain('enable trigger meeting_program_render_print_inputs_immutable');
    expect(sql).toContain('meeting_program_render (ward_id, meeting_id, version desc)');
    expect(sql).toContain('draft and legacy null/null rows remain compatible');
  });

  it('preserves the 0077 structured-input protections', async () => {
    const [sql, priorSql] = await Promise.all([readSql(migrationPath), readSql(priorMigrationPath)]);

    expect(priorSql).toContain('prevent_published_print_input_mutation');
    expect(priorSql).toContain('meeting_program_render_print_inputs_immutable');
    expect(sql).toContain('meeting_program_render_published_by_user_id_fkey');
    expect(sql).toContain('meeting_program_render_layout_json_render_data_json_consistent');
    expect(sql).not.toContain('drop table');
    expect(sql).not.toContain('truncate');
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toContain('restart identity');
  });

  it.skip('live PostgreSQL migration and RLS scenario (requires TEST_DATABASE_URL)', () => {
    // Kept separate from static migration assertions until a disposable PostgreSQL fixture is available.
  });
});
