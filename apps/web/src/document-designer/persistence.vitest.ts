import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_WARD_DOCUMENT_SETTINGS, loadWardDocumentSettings, saveMeetingDocument, saveWardDocumentSettings, settingsResponse } from './persistence';
import { DEFAULT_DOCUMENT_LAYOUT } from './schema';

describe('document designer persistence', () => {
  it('returns safe defaults when ward settings are absent', () => {
    expect(settingsResponse(null)).toEqual({
      defaultSacramentTemplateId: null,
      allowAdvancedProgramDesigner: false,
      allowProgramEditorPublish: false,
      allowProgramEditorRepublish: false,
      allowProgramEditorRollback: false,
      allowProgramEditorCreateTemplates: false,
      allowProgramEditorDeleteMedia: false,
      publicProgramExpirationDays: null
    });
    expect(DEFAULT_WARD_DOCUMENT_SETTINGS.allow_advanced_program_designer).toBe(false);
  });

  it('loads and writes every program permission setting', async () => {
    const client = { query: vi.fn() };
    const row = {
      ward_id: 'ward-a',
      ...DEFAULT_WARD_DOCUMENT_SETTINGS,
      allow_advanced_program_designer: true,
      allow_program_editor_publish: true
    };
    client.query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [row] });

    await expect(loadWardDocumentSettings(client, 'ward-a')).resolves.toEqual(row);
    await expect(saveWardDocumentSettings(client, 'ward-a', 'user-a', {
      allowAdvancedProgramDesigner: true,
      allowProgramEditorPublish: true,
      allowProgramEditorRepublish: false,
      allowProgramEditorRollback: false,
      allowProgramEditorCreateTemplates: false,
      allowProgramEditorDeleteMedia: false
    })).resolves.toEqual(row);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('WHERE ward_id = $1::uuid'), ['ward-a']);
    expect(client.query).toHaveBeenLastCalledWith(expect.stringContaining('$2::boolean'), expect.arrayContaining(['ward-a', true, true, 'user-a']));
  });

  it('uses a revision predicate when saving a meeting document', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ revision: 2 }] }) };
    client.query.mockResolvedValueOnce({ rows: [] }); // LOCK TABLE meeting_document
    await saveMeetingDocument(client, {
      wardId: 'ward-a',
      meetingId: 'meeting-a',
      documentType: 'SACRAMENT_PROGRAM',
      schemaVersion: 1,
      layout: DEFAULT_DOCUMENT_LAYOUT,
      theme: DEFAULT_DOCUMENT_LAYOUT.theme,
      updatedByUserId: 'user-a',
      expectedRevision: 1
    });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('WHERE meeting_document.revision = $10::int'), expect.arrayContaining(['meeting-a', 1]));
  });
});
