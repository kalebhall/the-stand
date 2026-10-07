import { describe, expect, it } from 'vitest';

import { parseProgramDocument } from './contracts';
import { sacramentMeetingProgramAdapter } from './sacrament-meeting-adapter';

const source = {
  wardId: 'ward-1',
  meetingId: 'meeting-1',
  meetingDate: '2026-10-04',
  meetingType: 'SACRAMENT',
  wardName: 'Freedom Park Ward',
  programItems: [
    {
      itemType: 'INTRODUCTION',
      title: null,
      sequence: 0,
      introductionRoles: {
        presiding: 'Bishop Hall',
        conducting: 'Sister Hall',
        organist: 'Brother Organist',
        chorister: 'Sister Chorister'
      }
    },
    { itemType: 'OPENING_HYMN', title: null, hymnTitle: 'Come, Come, Ye Saints', sequence: 1 },
    { itemType: 'SPEAKER', title: 'Speaker', topic: 'Faith', sequence: 2 }
  ]
};

describe('sacrament meeting program adapter', () => {
  it('keeps a stable Stand source reference and program identity', () => {
    expect(sacramentMeetingProgramAdapter.resolveSourceRef(source)).toEqual({
      sourceType: 'STAND_MEETING',
      sourceId: 'meeting-1',
      sourceVersion: null
    });
    expect(sacramentMeetingProgramAdapter.toDocument(source, { layout: 'draft' }).id).toBe('stand-meeting-program:meeting-1');
  });

  it('translates meeting data through the existing public-safe preview builder', () => {
    const renderInput = sacramentMeetingProgramAdapter.toRenderInput(source);
    expect(renderInput).toEqual(
      expect.objectContaining({
        meetingDate: '2026-10-04',
        meetingType: 'SACRAMENT',
        wardName: 'Freedom Park Ward',
        programItems: [
          { order: 0, label: 'Introduction', details: null },
          { order: 1, label: 'Come, Come, Ye Saints', details: null },
          { order: 2, label: 'Speaker', details: 'Faith' }
        ],
        publicValues: {
          PRESIDING_CONDUCTING: JSON.stringify({ presiding: 'Bishop Hall', conducting: 'Sister Hall' }),
          MUSIC_LEADERS: 'Organist / Pianist: Brother Organist\nChorister: Sister Chorister'
        }
      })
    );
    expect(renderInput.renderLabels?.programTitle).toBe('Sacrament Meeting Program');
    expect(renderInput.renderLabels?.itemLabels.OPENING_HYMN).toBe('Opening hymn');
  });

  it('uses the source locale for public music-leader labels', () => {
    const preview = sacramentMeetingProgramAdapter.toRenderInput({ ...source, locale: 'es' });
    expect(preview.publicValues?.MUSIC_LEADERS).toBe('Organista / pianista: Brother Organist\nDirector de música: Sister Chorister');
  });

  it('rejects a document with an invalid schema version', () => {
    expect(() =>
      parseProgramDocument({
        ...sacramentMeetingProgramAdapter.toDocument(source, {}),
        schemaVersion: 2
      })
    ).toThrow();
  });
});
