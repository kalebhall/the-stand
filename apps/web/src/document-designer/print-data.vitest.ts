import { describe, expect, it } from 'vitest';
import { loadPrintDocument, requiresSafePublishedSnapshot } from './print-data';
import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';

describe('published print fallback policy', () => {
  it('requires an immutable safe snapshot for non-draft meetings unless draft mode is explicit', () => {
    expect(requiresSafePublishedSnapshot('PUBLISHED', undefined)).toBe(true);
    expect(requiresSafePublishedSnapshot('COMPLETED', undefined)).toBe(true);
    expect(requiresSafePublishedSnapshot('PUBLISHED', '0')).toBe(true);
    expect(requiresSafePublishedSnapshot('PUBLISHED', '1')).toBe(false);
    expect(requiresSafePublishedSnapshot('DRAFT', undefined)).toBe(false);
  });
});

describe('loadPrintDocument published selection', () => {
  it('uses the rollback-selected active render instead of the latest version', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes('FROM meeting m'))
          return { rows: [{ ward_name: 'Ward', meeting_date: '2026-01-01', meeting_type: 'SACRAMENT', location: null }] };
        if (sql.includes('FROM public_program_share'))
          return { rows: [{ layout_json: { schemaVersion: 1 }, render_data_json: { media: {} }, version: 1 }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };

    const loaded = await loadPrintDocument(client as never, 'ward-1', 'meeting-1', 'published', null);

    expect(loaded?.publishedVersion).toBe(1);
    expect(calls.at(-1)?.sql).toContain('s.active_render_id');
    expect(calls.at(-1)?.sql).toContain('s.ward_id = $1::uuid AND s.meeting_id = $2::uuid');
    expect(calls.at(-1)?.sql).toContain('publication_metadata_json @> \'{"publicSafetyVersion":1}\'::jsonb');
    expect(calls.at(-1)?.sql).toContain('(s.expires_at IS NULL OR s.expires_at > now())');
    expect(calls.at(-1)?.sql).not.toContain('ORDER BY version DESC');
  });

  it('returns no published data when the active snapshot lacks the safety marker', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('FROM meeting m')) {
          return {
            rows: [{ ward_name: 'Ward', default_locale: 'en-US', meeting_date: '2026-01-01', meeting_type: 'SACRAMENT', location: null }]
          };
        }
        if (sql.includes('FROM public_program_share')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };

    await expect(loadPrintDocument(client as never, 'ward-1', 'meeting-1', 'published', null)).resolves.toBeNull();
    expect(calls.at(-1)).toContain('publication_metadata_json @> \'{"publicSafetyVersion":1}\'::jsonb');
  });

  it('projects legacy tri-fold layouts into explicit print panels', async () => {
    const layout = adaptLegacyLayoutToDocument({ preset: 'TRI_FOLD_BULLETIN', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
    const client = {
      query: async (sql: string) => {
        if (sql.includes('FROM meeting m'))
          return {
            rows: [{ ward_name: 'Ward', default_locale: 'en-US', meeting_date: '2026-01-01', meeting_type: 'SACRAMENT', location: null }]
          };
        if (sql.includes('FROM meeting_document')) return { rows: [{ layout_json: layout }] };
        if (sql.includes('FROM meeting_program_item')) return { rows: [] };
        if (sql.includes('FROM announcement')) return { rows: [] };
        if (sql.includes('FROM media_asset')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };

    const loaded = await loadPrintDocument(client as never, 'ward-1', 'meeting-1', 'draft', null);

    expect(loaded?.layout.schemaVersion).toBe(2);
    expect((loaded?.layout as { pages: Array<{ regions: unknown[] }> }).pages[0].regions).toHaveLength(6);
  });
});
