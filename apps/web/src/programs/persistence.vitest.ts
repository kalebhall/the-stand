import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DOCUMENT_LAYOUT } from '@/src/document-designer/schema';

import { loadProgramDocument, saveProgramDocument } from './persistence';

const document = {
  id: 'stand-meeting-program:meeting-1',
  programType: 'SACRAMENT_PROGRAM' as const,
  source: { sourceType: 'STAND_MEETING' as const, sourceId: 'meeting-1' },
  schemaVersion: 1 as const,
  metadata: { title: 'Sacrament Meeting', date: '2026-10-04', location: null },
  payload: { layout: DEFAULT_DOCUMENT_LAYOUT, theme: DEFAULT_DOCUMENT_LAYOUT.theme, sourceTemplateId: null, sourceTemplateVersion: null }
};

describe('Programs persistence facade', () => {
  it('loads the legacy meeting_document row as a generic program document', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{
      meeting_id: 'meeting-1',
      schema_version: 1,
      layout_json: DEFAULT_DOCUMENT_LAYOUT,
      theme_json: DEFAULT_DOCUMENT_LAYOUT.theme,
      source_template_id: null,
      source_template_version: null,
      revision: 4,
      updated_by_user_id: 'user-1',
      updated_at: '2026-10-01T00:00:00Z',
      meeting_date: '2026-10-04'
    }] }) };

    await expect(loadProgramDocument(client, { wardId: 'ward-1', meetingId: 'meeting-1' })).resolves.toMatchObject({
      id: 'stand-meeting-program:meeting-1',
      source: { sourceType: 'STAND_MEETING', sourceId: 'meeting-1', sourceVersion: '4' },
      revision: 4,
      metadata: { date: '2026-10-04' }
    });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM meeting_document md'), ['ward-1', 'meeting-1']);
  });

  it('writes through the existing meeting_document persistence and preserves revision checks', async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ revision: 5, updated_by_user_id: 'user-1', updated_at: '2026-10-01T00:00:00Z' }] }) };

    await expect(saveProgramDocument(client, {
      wardId: 'ward-1',
      document,
      updatedByUserId: 'user-1',
      expectedRevision: 4
    })).resolves.toMatchObject({ revision: 5, source: { sourceVersion: '5' } });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('WHERE meeting_document.revision = $10::int'), expect.arrayContaining(['ward-1', 'meeting-1', 4]));
  });

  it('returns null when the legacy optimistic-concurrency update affects no row', async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }) };
    await expect(saveProgramDocument(client, { wardId: 'ward-1', document, updatedByUserId: 'user-1', expectedRevision: 99 })).resolves.toBeNull();
  });
});
