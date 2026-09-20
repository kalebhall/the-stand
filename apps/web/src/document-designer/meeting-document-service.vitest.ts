import { describe, expect, it } from 'vitest';

import { adaptLegacyLayoutToDocument } from './legacy-layout-adapter';
import { buildPublicPreviewSource, SimpleModeValidationError, validateSimpleModeDraft } from './meeting-document-service';

const source = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });

describe('meeting document service', () => {
  it('allows simple visibility and reorder changes while preserving block IDs', () => {
    const draft = structuredClone(source);
    const blocks = draft.pages[0].regions[0].blocks;
    draft.pages[0].regions[0].blocks = [blocks[1], blocks[0], ...blocks.slice(2)];
    draft.pages[0].regions[0].blocks[0].visibility = 'HIDDEN';
    const result = validateSimpleModeDraft(draft, source);
    expect(result.layout.pages[0].regions[0].blocks.map((block) => block.id)).toEqual([blocks[1].id, blocks[0].id, ...blocks.slice(2).map((block) => block.id)]);
  });

  it('rejects unknown or structurally changed layouts', () => {
    expect(() => validateSimpleModeDraft({ nope: true }, source)).toThrowError(SimpleModeValidationError);
    const draft = structuredClone(source);
    draft.pages[0].regions[0].blocks.pop();
    expect(() => validateSimpleModeDraft(draft, source)).toThrow(/structure/i);
  });

  it('rejects edits to locked block content', () => {
    const current = structuredClone(source);
    const title = current.pages[0].regions[0].blocks.find((block) => block.type === 'DOCUMENT_TITLE');
    if (!title) throw new Error('title block missing');
    title.lock = { level: 'BLOCK', properties: ['CONTENT'] };
    const draft = structuredClone(current);
    (draft.pages[0].regions[0].blocks.find((block) => block.id === title.id)!.config as { text: string }).text = 'Changed';
    expect(() => validateSimpleModeDraft(draft, current)).toThrow(/locked/i);
  });

  it('builds public preview data without private fields', () => {
    const preview = buildPublicPreviewSource({ meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward' }, [
      { itemType: 'SPEAKER', title: 'Alex Hall', topic: 'Faith', sequence: 2, hymnTitle: null }
    ]);
    expect(preview.programItems[0]).toEqual({ order: 2, label: 'Alex Hall', details: 'Faith' });
    expect(preview).not.toHaveProperty('notes');
  });
});
