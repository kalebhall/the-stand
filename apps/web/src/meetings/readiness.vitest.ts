import { describe, expect, it } from 'vitest';

import { getMeetingReadiness } from './readiness';

describe('getMeetingReadiness', () => {
  it('reports missing meeting preparation fields', () => {
    const result = getMeetingReadiness([
      { itemType: 'SPEAKER', title: 'Jane', notes: '', hymnNumber: '', hymnTitle: '', speakerStatus: 'INVITED' },
      { itemType: 'OPENING_HYMN', title: '', notes: '', hymnNumber: '', hymnTitle: '' },
      { itemType: 'INVOCATION', title: '', notes: '', hymnNumber: '', hymnTitle: '' },
      { itemType: 'PRESIDING', title: '', notes: '', hymnNumber: '', hymnTitle: '' }
    ]);

    expect(result.speakers).toEqual({ total: 1, ready: 0, missingTopic: 1, pending: 1 });
    expect(result.hymns.missing).toBe(1);
    expect(result.prayers.missing).toBe(1);
    expect(result.requiredParticipants.missing).toBe(1);
  });

  it('reports complete fields without treating public notes as workflow state', () => {
    const result = getMeetingReadiness([
      { itemType: 'SPEAKER', title: 'Jane', topic: 'Faith', notes: 'private', hymnNumber: '', hymnTitle: '', speakerStatus: 'COMPLETED' },
      { itemType: 'OPENING_HYMN', title: '', notes: '', hymnNumber: '1', hymnTitle: 'The Morning Breaks' },
      { itemType: 'INVOCATION', title: 'Brother Smith', notes: '', hymnNumber: '', hymnTitle: '' }
    ]);

    expect(result).toEqual({
      speakers: { total: 1, ready: 1, missingTopic: 0, pending: 0 },
      hymns: { total: 1, missing: 0 },
      prayers: { total: 1, missing: 0 },
      requiredParticipants: { total: 0, missing: 0 }
    });
  });
});
