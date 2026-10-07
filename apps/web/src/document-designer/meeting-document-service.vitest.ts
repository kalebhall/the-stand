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
    expect(result.layout.pages[0].regions[0].blocks.map((block) => block.id)).toEqual([
      blocks[1].id,
      blocks[0].id,
      ...blocks.slice(2).map((block) => block.id)
    ]);
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
      { itemType: 'speaker', title: 'Alex Hall', topic: 'Faith', programNotes: 'Please welcome the family.', sequence: 2, hymnTitle: null },
      {
        itemType: 'OPENING_HYMN',
        title: null,
        topic: null,
        programNotes: null,
        sequence: 4,
        hymnNumber: '123',
        hymnTitle: 'I Need Thee Every Hour'
      },
      {
        itemType: 'WARD_AND_STAKE_BUSINESS',
        title: 'Private participant',
        topic: 'Private calling detail',
        programNotes: 'Private program detail',
        sequence: 3,
        hymnTitle: null
      },
      {
        itemType: 'introduction',
        title: 'Introduction',
        sequence: 1,
        hymnTitle: null,
        introductionRoles: {
          presiding: 'Bishop Hall',
          conducting: 'Sister Hall',
          organist: 'Brother Organist',
          chorister: 'Sister Chorister'
        }
      }
    ]);
    expect(preview.programItems[0]).toEqual({ order: 2, label: 'Alex Hall', details: 'Faith\nPlease welcome the family.' });
    expect(preview.programItems[1]).toEqual({ order: 4, label: '#123 — I Need Thee Every Hour', details: null });
    expect(preview.programItems[2]).toEqual({ order: 1, label: 'Introduction', details: null });
    expect(preview.publicValues).toEqual({
      PRESIDING_CONDUCTING: JSON.stringify({ presiding: 'Bishop Hall', conducting: 'Sister Hall' }),
      MUSIC_LEADERS: 'Organist / Pianist: Brother Organist\nChorister: Sister Chorister'
    });
    expect(preview).not.toHaveProperty('notes');
  });

  it('localizes public music-leader labels using the ward locale', () => {
    const preview = buildPublicPreviewSource({ meetingDate: '2026-09-20', meetingType: 'SACRAMENT', locale: 'es' }, [
      {
        itemType: 'INTRODUCTION',
        sequence: 1,
        introductionRoles: { organist: 'Hermano Organista', chorister: 'Hermana Directora' }
      }
    ]);

    expect(preview.publicValues?.MUSIC_LEADERS).toBe('Organista / pianista: Hermano Organista\nDirector de música: Hermana Directora');
  });

  it('includes only safe active announcement titles in the public values projection', () => {
    const preview = buildPublicPreviewSource(
      { meetingDate: '2026-09-20', meetingType: 'SACRAMENT', wardName: 'Freedom Park Ward' },
      [],
      [{ title: 'Ward activity this week' }]
    );
    expect(preview.publicValues).toEqual({ ANNOUNCEMENTS: 'Ward activity this week' });
  });
});
