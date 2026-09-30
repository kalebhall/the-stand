import { describe, expect, it } from 'vitest';

import { baptismProgramAdapter } from './baptism-adapter';
import { buildBaptismProgramDocument, requireProgramRegistration } from './service';

const source = {
  wardId: 'ward-1',
  eventId: 'baptism-1',
  eventVersion: 'event-3',
  date: '2026-10-11',
  title: 'Baptism Service',
  location: 'Freedom Park Ward',
  participantDisplayName: 'Jordan Hall',
  programItems: [
    { key: 'WELCOME', label: 'Welcome', content: null, sequence: 1 },
    { key: 'MUSIC', label: 'Musical Number', content: 'Come, Follow Me', sequence: 2 }
  ]
};

describe('baptism program adapter', () => {
  it('registers a second program type with a stable event source reference', () => {
    expect(requireProgramRegistration('BAPTISM_PROGRAM').sourceType).toBe('BAPTISM_EVENT');
    expect(baptismProgramAdapter.resolveSourceRef(source)).toEqual({
      sourceType: 'BAPTISM_EVENT',
      sourceId: 'baptism-1',
      sourceVersion: 'event-3'
    });
  });

  it('builds a public-safe document without source-internal identifiers', () => {
    const renderInput = baptismProgramAdapter.toRenderInput(source);
    expect(renderInput).toEqual({
      title: 'Baptism Service',
      date: '2026-10-11',
      location: 'Freedom Park Ward',
      participantDisplayName: 'Jordan Hall',
      items: source.programItems
    });
    expect(renderInput).not.toHaveProperty('wardId');
    expect(buildBaptismProgramDocument('BAPTISM_PROGRAM', source, { template: 'STANDARD_BAPTISM' }, 'ward-1')).toMatchObject({
      id: 'baptism-event-program:baptism-1',
      programType: 'BAPTISM_PROGRAM',
      payload: { template: 'STANDARD_BAPTISM' }
    });
  });

  it('rejects unregistered templates and extra source fields at the runtime boundary', () => {
    expect(() => baptismProgramAdapter.toDocument(source, { template: 'PRIVATE_TEMPLATE' })).toThrow();
    expect(() => baptismProgramAdapter.toRenderInput({ ...source, privateNote: 'do not publish' } as typeof source & { privateNote: string })).toThrow();
    expect(() => buildBaptismProgramDocument('BAPTISM_PROGRAM', source, { template: 'STANDARD_BAPTISM' }, 'ward-2')).toThrow(/requested ward/);
  });
});
