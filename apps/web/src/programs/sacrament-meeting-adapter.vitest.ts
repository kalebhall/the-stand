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
    { itemType: 'OPENING_HYMN', title: null, hymnTitle: 'Come, Come, Ye Saints', sequence: 1 },
    { itemType: 'SPEAKER', title: 'Speaker', topic: 'Faith', sequence: 2 }
  ]
};

describe('sacrament meeting program adapter', () => {
  it('keeps a stable Stand source reference and program identity', () => {
    expect(sacramentMeetingProgramAdapter.resolveSourceRef(source)).toEqual({ sourceType: 'STAND_MEETING', sourceId: 'meeting-1' });
    expect(sacramentMeetingProgramAdapter.toDocument(source, { layout: 'draft' }).id).toBe('stand-meeting-program:meeting-1');
  });

  it('translates meeting data through the existing public-safe preview builder', () => {
    expect(sacramentMeetingProgramAdapter.toRenderInput(source)).toEqual({
      meetingDate: '2026-10-04',
      meetingType: 'SACRAMENT',
      wardName: 'Freedom Park Ward',
      programItems: [
        { order: 1, label: 'Come, Come, Ye Saints', details: null },
        { order: 2, label: 'Speaker', details: 'Faith' }
      ]
    });
  });

  it('rejects a document with an invalid schema version', () => {
    expect(() => parseProgramDocument({
      ...sacramentMeetingProgramAdapter.toDocument(source, {}),
      schemaVersion: 2
    })).toThrow();
  });
});
