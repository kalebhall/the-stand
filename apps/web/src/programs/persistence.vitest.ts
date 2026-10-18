import { describe, expect, it, vi } from 'vitest';

import { BUILT_IN_TEMPLATES } from '@/src/document-designer/built-in-templates';
import { parseAdvancedLayout } from '@/src/document-designer/advanced-schema';
import { DEFAULT_DOCUMENT_LAYOUT } from '@/src/document-designer/schema';

import {
  clearLegacyTitleProvenance,
  ensureLegacyTitleProvenance,
  ensurePresidingConductingBlock,
  ensureProgramDocument,
  InvalidProgramPersistenceInputError,
  loadProgramDocument,
  saveProgramDocument
} from './persistence';

const document = {
  id: 'stand-meeting-program:meeting-1',
  programType: 'SACRAMENT_PROGRAM' as const,
  source: { sourceType: 'STAND_MEETING' as const, sourceId: 'meeting-1' },
  schemaVersion: 1 as const,
  metadata: { title: 'Sacrament Meeting', date: '2026-10-04', location: null },
  payload: { layout: DEFAULT_DOCUMENT_LAYOUT, theme: DEFAULT_DOCUMENT_LAYOUT.theme, sourceTemplateId: null, sourceTemplateVersion: null }
};

describe('Programs persistence facade', () => {
  it('backfills the leadership row into old persisted layouts before editing', () => {
    const legacy = structuredClone(DEFAULT_DOCUMENT_LAYOUT);
    legacy.pages[0].regions[0].blocks = legacy.pages[0].regions[0].blocks.filter(
      (block: { type: string }) => block.type !== 'PRESIDING_CONDUCTING'
    );
    const normalized = ensurePresidingConductingBlock(legacy);
    const blocks = normalized.pages[0].regions[0].blocks as Array<{ type: string }>;
    expect(blocks.map((block) => block.type)).toContain('PRESIDING_CONDUCTING');
    const leadershipIndex = blocks.findIndex((block) => block.type === 'PRESIDING_CONDUCTING');
    const programIndex = blocks.findIndex((block) => block.type === 'MEETING_PROGRAM');
    expect(leadershipIndex).toBeGreaterThanOrEqual(0);
    if (programIndex >= 0) expect(leadershipIndex).toBeLessThan(programIndex);
  });

  it('chooses deterministic case-insensitive unique IDs for missing leadership blocks', () => {
    const legacy = structuredClone(BUILT_IN_TEMPLATES.find((template) => template.key === 'full-page-standard')!.layout);
    const collisionIds = [
      '00000000-0000-4000-8000-000000000014',
      '00000000-0000-4000-8000-000000000015',
      '00000000-0000-4000-8000-000000000016',
      '00000000-0000-4000-8000-000000000017',
      '00000000-0000-4000-8000-000000000018',
      '00000000-0000-4000-8000-000000000019',
      '00000000-0000-4000-8000-00000000001A'
    ];
    legacy.id = collisionIds[0].toUpperCase() as typeof legacy.id;
    legacy.pages[0].id = collisionIds[1] as (typeof legacy.pages)[0]['id'];
    legacy.pages[0].regions[0].id = collisionIds[2] as (typeof legacy.pages)[0]['regions'][0]['id'];
    const blocks = legacy.pages[0].regions[0].blocks.filter((block) => block.type !== 'PRESIDING_CONDUCTING');
    expect(blocks).toHaveLength(7);
    legacy.pages[0].regions[0].blocks = blocks.map((block, index) => ({
      ...block,
      ...(index < 4 ? { id: collisionIds[index + 3] as typeof block.id } : {})
    }));

    for (const input of [legacy, parseAdvancedLayout(legacy)]) {
      const normalized = ensurePresidingConductingBlock(input);
      const ids = [
        normalized.id,
        ...normalized.pages.flatMap((page) => [
          page.id,
          ...page.regions.flatMap((region) => [region.id, ...region.blocks.map((block) => block.id)])
        ])
      ];
      const canonicalIds = ids.map((id) => id.toLowerCase());
      const leadership = normalized.pages[0].regions[0].blocks.find((block) => block.type === 'PRESIDING_CONDUCTING');

      expect(leadership?.id).toBe('00000000-0000-4000-8000-00000000001b');
      expect(new Set(canonicalIds).size).toBe(canonicalIds.length);
      expect(
        ensurePresidingConductingBlock(input).pages[0].regions[0].blocks.find((block) => block.type === 'PRESIDING_CONDUCTING')?.id
      ).toBe(leadership?.id);
      if ('schemaVersion' in normalized && normalized.schemaVersion === 2) {
        const region = normalized.pages[0].regions[0];
        const columnIds = region.columns.blockIds;
        const assignedIds = columnIds.flat();
        const blockIds = region.blocks.map((block) => block.id);
        expect(assignedIds).toHaveLength(blockIds.length);
        expect(new Set(assignedIds)).toEqual(new Set(blockIds));
        expect(assignedIds.filter((id) => id === leadership?.id)).toHaveLength(1);
        const meetingProgram = region.blocks.find((block) => block.type === 'MEETING_PROGRAM');
        if (leadership && meetingProgram) {
          const leadershipColumn = columnIds.find((column) => column.includes(leadership.id));
          const programColumn = columnIds.find((column) => column.includes(meetingProgram.id));
          expect(leadershipColumn).toBe(programColumn);
          expect(leadershipColumn!.indexOf(leadership.id)).toBeLessThan(leadershipColumn!.indexOf(meetingProgram.id));
        }
      }
    }
  });

  it('does not increment a document revision for JSONB key-order differences', async () => {
    const stableLayout = ensurePresidingConductingBlock(DEFAULT_DOCUMENT_LAYOUT);
    const persistedLayout = Object.fromEntries(Object.entries(stableLayout).reverse());
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'document-1',
            source_template_id: null,
            source_template_version: null,
            schema_version: 1,
            layout_json: persistedLayout,
            theme_json: DEFAULT_DOCUMENT_LAYOUT.theme,
            revision: 4
          }
        ]
      })
    };

    const result = await ensureProgramDocument(client, {
      wardId: 'ward-1',
      meetingId: 'meeting-1',
      userId: 'user-1',
      defaultLayout: DEFAULT_DOCUMENT_LAYOUT
    });

    expect(result.revision).toBe(4);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('backfills legacy title provenance and clears it for authored changes', () => {
    const legacy = structuredClone(DEFAULT_DOCUMENT_LAYOUT) as unknown as {
      metadata: Record<string, unknown>;
      pages: typeof DEFAULT_DOCUMENT_LAYOUT.pages;
    };
    legacy.metadata = { legacyPreset: 'FULL_PAGE' };
    const marked = ensureLegacyTitleProvenance(legacy);
    expect(marked.metadata.documentTitleSource).toBe('LEGACY_DEFAULT');

    const authored = clearLegacyTitleProvenance(marked, marked, true);
    expect(authored.metadata.documentTitleSource).toBe('AUTHORED');
  });

  it('preserves advanced column geometry when backfilling leadership', () => {
    const legacy = structuredClone(DEFAULT_DOCUMENT_LAYOUT);
    const region = legacy.pages[0].regions[0];
    region.blocks = region.blocks.filter((block: { type: string }) => block.type !== 'PRESIDING_CONDUCTING');
    const advanced = {
      ...legacy,
      schemaVersion: 2,
      pages: [
        {
          ...legacy.pages[0],
          regions: [
            {
              ...region,
              gutter: 8,
              columns: {
                count: 2,
                ratio: '1/1',
                gutter: 8,
                blockIds: [region.blocks.slice(0, 1).map((block) => block.id), region.blocks.slice(1).map((block) => block.id)]
              }
            }
          ]
        }
      ]
    };
    const normalized = ensurePresidingConductingBlock(advanced);
    const normalizedRegion = normalized.pages[0].regions[0] as typeof region & {
      columns: { count: number; ratio: string; gutter: number; blockIds: string[][] };
    };
    expect(normalizedRegion.columns.count).toBe(2);
    expect(normalizedRegion.columns.ratio).toBe('1/1');
    expect(normalizedRegion.columns.gutter).toBe(8);
    expect(normalizedRegion.columns.blockIds.flat()).toHaveLength(normalizedRegion.blocks.length);
  });

  it('does not mutate a locked legacy layout while backfilling leadership', () => {
    const legacy = structuredClone(DEFAULT_DOCUMENT_LAYOUT);
    legacy.pages[0].regions[0].blocks = legacy.pages[0].regions[0].blocks.filter(
      (block: { type: string }) => block.type !== 'PRESIDING_CONDUCTING'
    );
    (legacy as typeof legacy & { lock: { level: 'CONFIGURATION'; properties: ['CONTENT'] } }).lock = {
      level: 'CONFIGURATION',
      properties: ['CONTENT']
    };

    const normalized = ensurePresidingConductingBlock(legacy);

    expect(normalized).toEqual(legacy);
    expect(normalized.pages[0].regions[0].blocks.map((block) => block.type)).not.toContain('PRESIDING_CONDUCTING');
  });

  it('loads the legacy meeting_document row as a generic program document', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
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
          }
        ]
      })
    };

    await expect(loadProgramDocument(client, { wardId: 'ward-1', meetingId: 'meeting-1' })).resolves.toMatchObject({
      id: 'stand-meeting-program:meeting-1',
      source: { sourceType: 'STAND_MEETING', sourceId: 'meeting-1', sourceVersion: '4' },
      revision: 4,
      metadata: { date: '2026-10-04' }
    });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM meeting_document md'), ['ward-1', 'meeting-1']);
  });

  it('writes through the existing meeting_document persistence and preserves revision checks', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ revision: 5, updated_by_user_id: 'user-1', updated_at: '2026-10-01T00:00:00Z' }] })
    };

    await expect(
      saveProgramDocument(client, {
        wardId: 'ward-1',
        document,
        updatedByUserId: 'user-1',
        expectedRevision: 4
      })
    ).resolves.toMatchObject({ revision: 5, source: { sourceVersion: '5' } });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE meeting_document.revision = $10::int'),
      expect.arrayContaining(['ward-1', 'meeting-1', 4])
    );
  });

  it('returns null when the legacy optimistic-concurrency update affects no row', async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }) };
    await expect(
      saveProgramDocument(client, { wardId: 'ward-1', document, updatedByUserId: 'user-1', expectedRevision: 99 })
    ).resolves.toBeNull();
  });

  it('loads advanced schema-v2 layouts without confusing layout and program schema versions', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            meeting_id: 'meeting-1',
            schema_version: 2,
            layout_json: { ...DEFAULT_DOCUMENT_LAYOUT, schemaVersion: 2 },
            theme_json: DEFAULT_DOCUMENT_LAYOUT.theme,
            source_template_id: null,
            source_template_version: null,
            revision: 6,
            updated_by_user_id: 'user-1',
            updated_at: '2026-10-01T00:00:00Z',
            meeting_date: '2026-10-04'
          }
        ]
      })
    };

    await expect(loadProgramDocument(client, { wardId: 'ward-1', meetingId: 'meeting-1' })).resolves.toMatchObject({
      schemaVersion: 1,
      payload: { layout: { schemaVersion: 2 } }
    });
  });

  it('writes the persisted layout schema version when saving an advanced layout', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ revision: 7, updated_by_user_id: 'user-1', updated_at: '2026-10-01T00:00:00Z' }] })
    };
    const advancedLayout = { ...DEFAULT_DOCUMENT_LAYOUT, schemaVersion: 2 } as never;
    await saveProgramDocument(client, {
      wardId: 'ward-1',
      document: { ...document, payload: { ...document.payload, layout: advancedLayout } },
      updatedByUserId: 'user-1',
      expectedRevision: 6
    });
    expect(client.query).toHaveBeenLastCalledWith(
      expect.stringContaining('WHERE meeting_document.revision = $10::int'),
      expect.arrayContaining([2, 6])
    );
  });

  it('does not persist non-sacrament documents through the legacy meeting facade', async () => {
    const client = { query: vi.fn() };
    await expect(
      saveProgramDocument(client, {
        wardId: 'ward-1',
        document: {
          id: 'baptism-event-program:event-1',
          programType: 'BAPTISM_PROGRAM',
          source: { sourceType: 'BAPTISM_EVENT', sourceId: 'event-1' },
          schemaVersion: 1,
          metadata: { title: 'Baptism', date: '2026-10-11', location: null },
          payload: { layout: DEFAULT_DOCUMENT_LAYOUT, theme: DEFAULT_DOCUMENT_LAYOUT.theme }
        },
        updatedByUserId: 'user-1'
      })
    ).rejects.toThrow(InvalidProgramPersistenceInputError);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects malformed persisted layout JSON with a typed persistence error', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            meeting_id: 'meeting-1',
            schema_version: 1,
            layout_json: null,
            theme_json: DEFAULT_DOCUMENT_LAYOUT.theme,
            revision: 1,
            meeting_date: '2026-10-04'
          }
        ]
      })
    };
    await expect(loadProgramDocument(client, { wardId: 'ward-1', meetingId: 'meeting-1' })).rejects.toThrow(
      InvalidProgramPersistenceInputError
    );
  });

  it('rejects inconsistent and invalid advanced layout metadata', async () => {
    const invalidAdvancedLayout = structuredClone(DEFAULT_DOCUMENT_LAYOUT) as Record<string, unknown>;
    invalidAdvancedLayout.schemaVersion = 2;
    const firstBlock = ((invalidAdvancedLayout.pages as Array<Record<string, unknown>>)[0].regions as Array<Record<string, unknown>>)[0]
      .blocks as Array<Record<string, unknown>>;
    firstBlock[0].styleOverrides = { fontSize: 1 };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            meeting_id: 'meeting-1',
            schema_version: 2,
            layout_json: invalidAdvancedLayout,
            theme_json: DEFAULT_DOCUMENT_LAYOUT.theme,
            revision: 1,
            meeting_date: '2026-10-04'
          }
        ]
      })
    };
    await expect(loadProgramDocument(client, { wardId: 'ward-1', meetingId: 'meeting-1' })).rejects.toThrow(
      InvalidProgramPersistenceInputError
    );

    client.query.mockResolvedValue({
      rows: [
        {
          meeting_id: 'meeting-1',
          schema_version: 2,
          layout_json: DEFAULT_DOCUMENT_LAYOUT,
          theme_json: DEFAULT_DOCUMENT_LAYOUT.theme,
          revision: 1,
          meeting_date: '2026-10-04'
        }
      ]
    });
    await expect(loadProgramDocument(client, { wardId: 'ward-1', meetingId: 'meeting-1' })).rejects.toThrow(
      InvalidProgramPersistenceInputError
    );
  });
});
