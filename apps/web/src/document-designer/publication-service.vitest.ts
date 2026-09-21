import { describe, expect, it } from 'vitest';
import type { Queryable } from './persistence';
import { buildImmutableRenderInsertPayload, calculatePublicationExpiration, insertImmutableRender, nextPublicationVersion, safePublicationMetadata, updateActivePublicPointer } from './publication-service';
import { DEFAULT_DOCUMENT_LAYOUT } from './schema';
import type { ResolvedDocumentData } from './render-types';

const data: ResolvedDocumentData = { meetingDate: '2026-01-01', meetingType: 'SACRAMENT', values: {}, meetingItems: [], warnings: [] };
function db(rows: Record<string, unknown>[]): Queryable & { sql: string[]; values: readonly unknown[][] } {
  const sql: string[] = [];
  const values: readonly unknown[][] = [];
  return { sql, values, query: async (text: string, params?: readonly unknown[]) => { sql.push(text); (values as unknown[][]).push([...(params ?? [])]); return { rows }; } };
}

describe('publication service', () => {
  it('sequences versions after a ward-scoped, locked meeting lookup', async () => {
    const client = db([{ id: 'm1' }]);
    client.query = async (text: string, params?: readonly unknown[]) => {
      client.sql.push(text); (client.values as unknown[][]).push([...(params ?? [])]);
      return { rows: text.includes('next_version') ? [{ next_version: 4 }] : [{ id: 'm1' }] };
    };
    expect(await nextPublicationVersion(client, { wardId: 'w1', meetingId: 'm1' })).toBe(4);
    expect(client.sql[0]).toContain('id = $1::uuid AND ward_id = $2::uuid FOR UPDATE');
    expect(client.sql[1]).toContain('ward_id = $1::uuid AND meeting_id = $2::uuid');
  });

  it('fails version allocation when the meeting is missing', async () => {
    const client = db([]);
    await expect(nextPublicationVersion(client, { wardId: 'w1', meetingId: 'm1' })).rejects.toMatchObject({ code: 'MEETING_NOT_FOUND' });
  });

  it('calculates expiration and preserves immutable inputs in a cloned payload', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    expect(calculatePublicationExpiration(publishedAt, 7)?.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(calculatePublicationExpiration(publishedAt, null)).toBeNull();
    expect(() => calculatePublicationExpiration(publishedAt, -1)).toThrow(RangeError);
    const sourceLayout = structuredClone(DEFAULT_DOCUMENT_LAYOUT);
    const sourceData = structuredClone(data);
    const payload = buildImmutableRenderInsertPayload({ wardId: 'w1', meetingId: 'm1', version: 1, renderHtml: '<p>x</p>', layoutJson: sourceLayout, renderDataJson: sourceData, documentType: 'SACRAMENT_PROGRAM', sourceTemplateId: 't1', sourceTemplateVersion: 2, publishedByUserId: 'u1', publishedAt, publicationMetadata: { rendererVersion: 'm8', pageCount: 1, layoutHash: 'h', validationWarningCodes: ['B', 'A', 'A'] } });
    sourceLayout.theme.accentColor = '#ffffff';
    sourceData.values.DOCUMENT_TITLE = 'changed';
    expect(payload.publicationMetadataJson.validationWarningCodes).toEqual(['A', 'B']);
    expect(payload.layoutJson).not.toBe(sourceLayout);
    expect(payload.layoutJson.theme.accentColor).toBe('#1f2937');
    expect(payload.renderDataJson).not.toBe(sourceData);
    expect(payload.publishedAt).not.toBe(publishedAt);
  });

  it('inserts immutable JSON with explicit database casts', async () => {
    const client = db([{ id: 'r1', version: 1 }]);
    const payload = buildImmutableRenderInsertPayload({ wardId: 'w1', meetingId: 'm1', version: 1, renderHtml: '<p>x</p>', layoutJson: DEFAULT_DOCUMENT_LAYOUT, renderDataJson: data, documentType: 'SACRAMENT_PROGRAM', sourceTemplateId: null, sourceTemplateVersion: null, publishedByUserId: 'u1', publishedAt: new Date('2026-01-01T00:00:00Z'), publicationMetadata: { rendererVersion: 'm8', pageCount: 1, layoutHash: 'h' } });
    await expect(insertImmutableRender(client, payload)).resolves.toEqual({ id: 'r1', version: 1 });
    expect(client.sql[0]).toContain('$1::uuid');
    expect(client.sql[0]).toContain('$3::int');
    expect(client.sql[0]).toContain('$5::jsonb');
    expect(client.sql[0]).toContain('$6::jsonb');
    expect(client.sql[0]).toContain('$11::timestamptz');
    expect(client.sql[0]).toContain('$12::jsonb');
  });

  it('updates only the active pointer, carries expiration, and reports a missing share', async () => {
    expect(safePublicationMetadata({ rendererVersion: 'm8', pageCount: 1, layoutHash: 'h' })).toEqual({ rendererVersion: 'm8', pageCount: 1, layoutHash: 'h', validationWarningCodes: [] });
    const client = db([{ meeting_id: 'm1' }]);
    const expiresAt = new Date('2026-01-08T00:00:00Z');
    await updateActivePublicPointer(client, { wardId: 'w1', meetingId: 'm1', renderId: 'r1', expiresAt });
    expect(client.sql[0]).toContain('UPDATE public_program_share');
    expect(client.sql[0]).toContain('$1::uuid');
    expect(client.sql[0]).toContain('$2::timestamptz');
    expect(client.sql[0]).not.toContain('meeting_program_render SET');
    expect(client.values[0][2]).toBe('w1');

    const missing = db([]);
    await expect(updateActivePublicPointer(missing, { wardId: 'w1', meetingId: 'm1', renderId: 'r1', expiresAt: null })).rejects.toMatchObject({ code: 'ACTIVE_POINTER_FAILED' });
  });
});
