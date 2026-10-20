import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

import { afterAll, describe, expect, it } from 'vitest';

const migrationPath = path.resolve(import.meta.dirname, '../../drizzle/archive/v1/0078_publication_history_and_active_pointer.sql');
const safetyMigrationPath = path.resolve(import.meta.dirname, '../../drizzle/0057_public_program_snapshot_safety_guard.sql');
const priorMigrationPath = path.resolve(import.meta.dirname, '../../drizzle/archive/v1/0077_published_print_input_immutability.sql');
const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const pool = dbUrl ? new Pool({ connectionString: dbUrl }) : undefined;

async function readSql(filePath: string): Promise<string> {
  return (await readFile(filePath, 'utf8')).toLowerCase();
}

describe('publication schema migration', () => {
  afterAll(async () => {
    await pool?.end();
  });

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
    expect(sql).toContain("publication_metadata_json = '{}'::jsonb");
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

  it('requires a safe immutable snapshot before a share can be activated', async () => {
    const sql = await readSql(safetyMigrationPath);

    expect(sql).toContain('create or replace function public.validate_public_program_share_active_render()');
    expect(sql).toContain('render.publication_metadata_json @> \'{"publicsafetyversion":1}\'::jsonb');
    expect(sql).toContain('render.layout_json is not null');
    expect(sql).toContain('render.render_data_json is not null');
    expect(sql).toContain("using errcode = '23514'");
  });

  it.skipIf(!dbUrl)('rejects activation of an unmarked render and accepts a safe immutable snapshot in PostgreSQL', async () => {
    const client = await pool!.connect();
    const ids = {
      stake: randomUUID(),
      ward: randomUUID(),
      user: randomUUID(),
      meeting: randomUUID(),
      share: randomUUID(),
      legacy: randomUUID(),
      safe: randomUUID()
    };
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL row_security = on');
      await client.query('INSERT INTO stake (id, name) VALUES ($1::uuid, $2)', [ids.stake, `Safety Stake ${ids.stake}`]);
      await client.query('INSERT INTO ward (id, stake_id, name, unit_number) VALUES ($1::uuid, $2::uuid, $3, $4)', [
        ids.ward,
        ids.stake,
        `Safety Ward ${ids.ward}`,
        ids.ward.slice(0, 6)
      ]);
      await client.query('INSERT INTO user_account (id, email) VALUES ($1::uuid, $2)', [ids.user, `snapshot-${ids.user}@example.test`]);
      const role = await client.query(
        `INSERT INTO role (name, scope) VALUES ('BISHOPRIC_EDITOR', 'WARD') ON CONFLICT (name) DO NOTHING RETURNING id`
      );
      const roleId =
        role.rows[0]?.id ??
        (await client.query(`SELECT id FROM role WHERE name = 'BISHOPRIC_EDITOR' AND scope = 'WARD' LIMIT 1`)).rows[0]?.id;
      await client.query("SELECT set_config('app.user_id', $1, true)", [ids.user]);
      await client.query("SELECT set_config('app.ward_id', $1, true)", [ids.ward]);
      await client.query('INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES ($1::uuid, $2::uuid, $3::uuid)', [
        ids.ward,
        ids.user,
        roleId
      ]);
      await client.query(
        "INSERT INTO meeting (id, ward_id, meeting_date, meeting_type, status) VALUES ($1::uuid, $2::uuid, '2026-10-20', 'SACRAMENT', 'PUBLISHED')",
        [ids.meeting, ids.ward]
      );
      await client.query('INSERT INTO public_program_share (id, ward_id, meeting_id, token) VALUES ($1::uuid, $2::uuid, $3::uuid, $4)', [
        ids.share,
        ids.ward,
        ids.meeting,
        `safety-${ids.share}`
      ]);
      await client.query(
        `INSERT INTO meeting_program_render (id, ward_id, meeting_id, version, render_html, layout_json, render_data_json, publication_metadata_json)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 1, '<p>legacy</p>', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
        [ids.legacy, ids.ward, ids.meeting]
      );

      await client.query('SAVEPOINT reject_legacy_snapshot');
      let legacyActivationCode: string | undefined;
      try {
        await client.query('UPDATE public_program_share SET active_render_id = $1::uuid WHERE id = $2::uuid', [ids.legacy, ids.share]);
      } catch (error) {
        legacyActivationCode = (error as { code?: string }).code;
      }
      expect(legacyActivationCode).toBe('23514');
      await client.query('ROLLBACK TO SAVEPOINT reject_legacy_snapshot');

      await client.query(
        `INSERT INTO meeting_program_render (id, ward_id, meeting_id, version, render_html, layout_json, render_data_json, publication_metadata_json)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 2, '<p>safe</p>', '{}'::jsonb, '{}'::jsonb, '{"publicSafetyVersion":1}'::jsonb)`,
        [ids.safe, ids.ward, ids.meeting]
      );
      const activated = await client.query(
        'UPDATE public_program_share SET active_render_id = $1::uuid WHERE id = $2::uuid RETURNING active_render_id',
        [ids.safe, ids.share]
      );
      expect(activated.rows[0]?.active_render_id).toBe(ids.safe);
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  it.skipIf(!dbUrl)('verifies the migrated publication schema and RLS contract in PostgreSQL', async () => {
    const client = await pool!.connect();
    try {
      const columns = await client.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('meeting_program_render', 'public_program_share')
            AND column_name IN ('published_at', 'publication_metadata_json', 'active_render_id', 'expires_at')`
      );
      expect(new Set((columns.rows as Array<{ column_name: string }>).map((row) => row.column_name))).toEqual(
        new Set(['published_at', 'publication_metadata_json', 'active_render_id', 'expires_at'])
      );

      const security = await client.query(
        `SELECT relrowsecurity, relforcerowsecurity
           FROM pg_class
          WHERE oid = 'public.public_program_share'::regclass`
      );
      expect(security.rows[0] as { relrowsecurity: boolean; relforcerowsecurity: boolean }).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true
      });

      const triggers = await client.query(
        `SELECT tgname
           FROM pg_trigger
          WHERE tgrelid = 'public.public_program_share'::regclass
            AND NOT tgisinternal`
      );
      expect((triggers.rows as Array<{ tgname: string }>).map((row) => row.tgname)).toContain(
        'public_program_share_active_render_published_guard'
      );
      const functionBody = await client.query(
        `SELECT pg_get_functiondef('public.validate_public_program_share_active_render()'::regprocedure) AS body`
      );
      expect((functionBody.rows[0] as { body: string }).body).toContain('publicSafetyVersion');
      expect((functionBody.rows[0] as { body: string }).body).toContain('\'{"publicSafetyVersion":1}\'::jsonb');
    } finally {
      client.release();
    }
  });
});
