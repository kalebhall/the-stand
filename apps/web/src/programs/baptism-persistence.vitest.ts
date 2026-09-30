import { describe, expect, it, vi } from 'vitest';

import { baptismProgramAdapter, type BaptismProgramPayload } from './baptism-adapter';
import type { ProgramDocument } from './contracts';
import { loadBaptismProgramDocument, saveBaptismProgramDocument } from './baptism-persistence';

const source = {
  wardId: 'ward-1',
  eventId: 'event-1',
  eventVersion: '3',
  date: '2026-10-11',
  title: 'Baptism Service',
  location: 'Freedom Park Ward',
  participantDisplayName: 'Jordan Hall',
  programItems: [{ key: 'WELCOME', label: 'Welcome', content: null, sequence: 1 }]
};

const document = baptismProgramAdapter.toDocument(source, {
  template: 'STANDARD_BAPTISM',
  participantDisplayName: source.participantDisplayName,
  items: source.programItems
}) as ProgramDocument<BaptismProgramPayload>;

describe('baptism Programs persistence', () => {
  it('writes a ward-scoped document with optimistic concurrency', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{
      schema_version: 1,
      document_json: document,
      source_id: 'event-1',
      source_version: '3',
      revision: 1,
      updated_by_user_id: 'user-1',
      updated_at: '2026-10-11T00:00:00Z'
    }] }) };
    await expect(saveBaptismProgramDocument(client, { wardId: 'ward-1', document })).resolves.toMatchObject({
      programType: 'BAPTISM_PROGRAM',
      source: { sourceType: 'BAPTISM_EVENT', sourceId: 'event-1', sourceVersion: '3' },
      revision: 1
    });
    expect(client.query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE program_document.revision = $8::int'), expect.arrayContaining(['ward-1', 'event-1', 'BAPTISM_PROGRAM', 'BAPTISM_EVENT', '3', 0]));
  });

  it('loads only the requested ward and event source', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{
      schema_version: 1,
      document_json: document,
      source_id: 'event-1',
      source_version: '3',
      revision: 2,
      updated_by_user_id: 'user-1',
      updated_at: null
    }] }) };
    await expect(loadBaptismProgramDocument(client, { wardId: 'ward-1', eventId: 'event-1' })).resolves.toMatchObject({ revision: 2 });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("program_type = 'BAPTISM_PROGRAM'"), ['ward-1', 'event-1']);
  });

  it('returns null when optimistic concurrency rejects the update', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(saveBaptismProgramDocument(client, { wardId: 'ward-1', document, expectedRevision: 9 })).resolves.toBeNull();
  });

  it('returns null when the source event is not visible in the ward', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(saveBaptismProgramDocument(client, { wardId: 'ward-1', document })).resolves.toBeNull();
  });

  it('rejects a mismatched canonical document ID', async () => {
    const client = { query: vi.fn() };
    await expect(saveBaptismProgramDocument(client, { wardId: 'ward-1', document: { ...document, id: 'wrong-id' } })).rejects.toThrow(/document ID/);
    expect(client.query).not.toHaveBeenCalled();
  });
});
