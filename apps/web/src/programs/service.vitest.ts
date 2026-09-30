import { describe, expect, it } from 'vitest';

import { buildProgramDocument, requireProgramRegistration, UnknownProgramTypeError } from './service';

const source = {
  wardId: 'ward-1',
  meetingId: 'meeting-1',
  meetingDate: '2026-10-04',
  meetingType: 'SACRAMENT',
  sourceVersion: 'meeting-updated-7',
  programItems: []
};

describe('program service boundary', () => {
  it('resolves the registered program type and builds a document through its adapter', () => {
    expect(requireProgramRegistration('SACRAMENT_PROGRAM').sourceType).toBe('STAND_MEETING');
    expect(buildProgramDocument('SACRAMENT_PROGRAM', source, { layout: 'draft' })).toMatchObject({
      id: 'stand-meeting-program:meeting-1',
      source: { sourceType: 'STAND_MEETING', sourceId: 'meeting-1', sourceVersion: 'meeting-updated-7' },
      payload: { layout: 'draft' }
    });
  });

  it('rejects unsupported program types before any adapter work', () => {
    expect(() => requireProgramRegistration('FUNERAL_PROGRAM')).toThrow(UnknownProgramTypeError);
    expect(() => buildProgramDocument('FUNERAL_PROGRAM', source, {})).toThrow(UnknownProgramTypeError);
  });
});
