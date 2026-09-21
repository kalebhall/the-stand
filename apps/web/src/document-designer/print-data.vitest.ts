import { describe, expect, it } from 'vitest';
import { loadPrintDocument } from './print-data';

describe('loadPrintDocument published selection', () => {
  it('uses the rollback-selected active render instead of the latest version', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes('FROM meeting m')) return { rows: [{ ward_name: 'Ward', meeting_date: '2026-01-01', meeting_type: 'SACRAMENT', location: null }] };
        if (sql.includes('FROM public_program_share')) return { rows: [{ layout_json: { schemaVersion: 1 }, render_data_json: { media: {} }, version: 1 }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };

    const loaded = await loadPrintDocument(client as never, 'ward-1', 'meeting-1', 'published', null);

    expect(loaded?.publishedVersion).toBe(1);
    expect(calls.at(-1)?.sql).toContain('s.active_render_id');
    expect(calls.at(-1)?.sql).toContain('s.ward_id = $1::uuid AND s.meeting_id = $2::uuid');
    expect(calls.at(-1)?.sql).toContain('(s.expires_at IS NULL OR s.expires_at > now())');
    expect(calls.at(-1)?.sql).not.toContain('ORDER BY version DESC');
  });
});
