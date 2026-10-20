import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  connectMock,
  queryMock,
  releaseMock,
  setDbContextMock,
  auditMock,
  moduleEnabledMock,
  moduleEnabledInTransactionMock,
  advancedCapabilityMock
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  setDbContextMock: vi.fn(),
  auditMock: vi.fn(),
  moduleEnabledMock: vi.fn(),
  moduleEnabledInTransactionMock: vi.fn(),
  advancedCapabilityMock: vi.fn(() => false)
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({
  canViewProgramDesigner: vi.fn(() => true),
  canEditProgramDesign: vi.fn(() => true),
  canUseAdvancedProgramDesigner: advancedCapabilityMock
}));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: auditMock }));
vi.mock('@/src/modules/service', () => ({
  isWardModuleEnabled: moduleEnabledMock,
  isWardModuleEnabledInTransaction: moduleEnabledInTransactionMock
}));

import { adaptLegacyLayoutToDocument } from '@/src/document-designer/legacy-layout-adapter';
import { DEFAULT_DOCUMENT_LAYOUT } from '@/src/document-designer/schema';
import { BUILT_IN_TEMPLATES } from '@/src/document-designer/built-in-templates';
import {
  downgradeToV1,
  normalizeToAdvanced,
  parseAdvancedLayout,
  projectAdvancedLayoutForPublic
} from '@/src/document-designer/advanced-schema';
import { validatePublicDocumentLayout } from '@/src/document-designer/public-safety';
import { GET, POST, PUT } from './route';

const layout = adaptLegacyLayoutToDocument({ preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' });
const documentRow = {
  id: 'document-1',
  source_template_id: 'template-1',
  source_template_version: 2,
  schema_version: 1,
  layout_json: layout,
  theme_json: layout.theme,
  revision: 3,
  source_template_name: 'Ward Template'
};

function params() {
  return { params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' }) };
}

describe('program design route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockReset();
    connectMock.mockReset();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['PROGRAM_EDITOR'], name: 'Editor' }, activeWardId: 'ward-1' });
    auditMock.mockResolvedValue(undefined);
    moduleEnabledMock.mockResolvedValue(true);
    moduleEnabledInTransactionMock.mockResolvedValue(true);
    advancedCapabilityMock.mockReturnValue(false);
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  });

  it('denies direct access when the Programs module is disabled', async () => {
    moduleEnabledMock.mockResolvedValue(false);
    moduleEnabledInTransactionMock.mockResolvedValue(false);
    const response = await GET(new Request('http://localhost'), params());
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  });

  it('returns a ward-scoped document and safe preview source', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'meeting-1', meeting_date: '2026-09-20', meeting_type: 'SACRAMENT', ward_name: 'Freedom Park Ward' }]
      })
      .mockResolvedValueOnce({ rows: [{ item_type: 'SPEAKER', title: 'Alex Hall', topic: 'Faith', hymn_title: null, sequence: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.revision).toBe(3);
    expect(body.document.sourceTemplateVersion).toBe(2);
    expect(body.previewSource.programItems[0]).toEqual({
      order: 2,
      label: body.previewSource.renderLabels.itemLabels.SPEAKER,
      details: ['Alex Hall', 'Faith'].join(String.fromCharCode(10))
    });
  });

  it('hides Advanced Layout when the global feature flag is disabled', async () => {
    const previous = process.env.ADVANCED_DESIGNER_ENABLED;
    process.env.ADVANCED_DESIGNER_ENABLED = 'false';
    try {
      queryMock
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{ id: 'meeting-1', meeting_date: '2026-09-20', meeting_type: 'SACRAMENT', ward_name: 'Freedom Park Ward' }]
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [documentRow] })
        .mockResolvedValueOnce({ rows: [documentRow] })
        .mockResolvedValueOnce({});
      const response = await GET(new Request('http://localhost'), params());
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.document).not.toHaveProperty('advancedLayout');
      expect(body.document.schemaVersion).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.ADVANCED_DESIGNER_ENABLED;
      else process.env.ADVANCED_DESIGNER_ENABLED = previous;
    }
  });

  it('saves only with the expected revision and increments it without publishing', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', revision: 4 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const response = await PUT(
      new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ expectedRevision: 3, document: layout }) }),
      params()
    );
    expect(response.status).toBe(200);
    expect((await response.json()).revision).toBe(4);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE meeting_document'), expect.arrayContaining([3]));
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('meeting_program_render'), expect.anything());
  });

  it('saves and reloads section headings and simple lists in the Advanced document', async () => {
    advancedCapabilityMock.mockReturnValue(true);
    const source = normalizeToAdvanced(layout);
    const sourceRegion = source.pages[0].regions[0];
    const heading = {
      ...sourceRegion.blocks[0],
      type: 'SECTION_HEADING',
      dataMode: 'MANUAL',
      config: { title: 'Community', subtitle: 'This week', presentation: 'ACCENT' }
    };
    const simpleList = {
      ...sourceRegion.blocks[1],
      type: 'SIMPLE_LIST',
      dataMode: 'MANUAL',
      config: {
        presentation: 'NUMBERED',
        items: [
          { id: '22222222-2222-4222-8222-222222222222', order: 0, text: 'Food drive' },
          { id: '33333333-3333-4333-8333-333333333333', order: 1, text: 'Youth activity' }
        ]
      }
    };
    const savedLayout = {
      ...source,
      pages: source.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              regions: page.regions.map((region, regionIndex) =>
                regionIndex === 0 ? { ...region, blocks: [heading, simpleList, ...region.blocks.slice(2)] } : region
              )
            }
          : page
      )
    } as typeof source;

    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', revision: 4 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const saveResponse = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: 3, document: savedLayout, mode: 'ADVANCED' })
      }),
      params()
    );
    expect(saveResponse.status).toBe(200);
    const savedRow = { ...documentRow, schema_version: 2, layout_json: savedLayout };
    const updateCall = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE meeting_document'));
    const persistedLayout = JSON.parse(String(updateCall?.[1]?.[5]));
    expect(persistedLayout).toMatchObject({ schemaVersion: 2 });
    expect(persistedLayout.pages[0].regions[0].blocks.slice(0, 2)).toMatchObject([
      { type: 'SECTION_HEADING', config: { title: 'Community', subtitle: 'This week', presentation: 'ACCENT' } },
      { type: 'SIMPLE_LIST', config: { presentation: 'NUMBERED', items: [{ text: 'Food drive' }, { text: 'Youth activity' }] } }
    ]);

    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'meeting-1', meeting_date: '2026-09-20', meeting_type: 'SACRAMENT', ward_name: 'Freedom Park Ward' }]
      })
      .mockResolvedValueOnce({ rows: [{ item_type: 'SPEAKER', title: 'Alex Hall', topic: 'Faith', hymn_title: null, sequence: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [savedRow] })
      .mockResolvedValueOnce({ rows: [savedRow] })
      .mockResolvedValueOnce({});
    const reloadResponse = await GET(new Request('http://localhost'), params());
    expect(reloadResponse.status).toBe(200);
    const reloaded = await reloadResponse.json();
    expect(reloaded.document.schemaVersion).toBe(2);
    expect(reloaded.document.advancedLayout.pages[0].regions[0].blocks.slice(0, 2)).toMatchObject([
      { type: 'SECTION_HEADING', config: { title: 'Community', subtitle: 'This week', presentation: 'ACCENT' } },
      { type: 'SIMPLE_LIST', config: { presentation: 'NUMBERED', items: [{ text: 'Food drive' }, { text: 'Youth activity' }] } }
    ]);
  });

  it('still rejects a protected Advanced mutation in an ordinary Simple Mode save', async () => {
    const currentAdvanced = normalizeToAdvanced({
      ...layout,
      pages: layout.pages.map((page, pageIndex) =>
        pageIndex === 0
          ? {
              ...page,
              regions: page.regions.map((region, regionIndex) =>
                regionIndex === 0
                  ? {
                      ...region,
                      blocks: region.blocks.map((block, blockIndex) =>
                        blockIndex === 0
                          ? { ...block, type: 'PRESIDING_CONDUCTING', dataMode: 'AUTO', config: { text: 'Presiding and conducting' } }
                          : block
                      )
                    }
                  : region
              )
            }
          : page
      )
    });
    const attemptedSimple = downgradeToV1(currentAdvanced);
    const advancedBlock = attemptedSimple.pages[0].regions[0].blocks.find((block) => block.type === 'PRESIDING_CONDUCTING');
    if (!advancedBlock) throw new Error('Expected advanced test block');
    advancedBlock.config = { text: 'Changed without Advanced Mode' };

    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [{ ...documentRow, layout_json: currentAdvanced, schema_version: 2 }] });
    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: 3, document: attemptedSimple })
      }),
      params()
    );

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('ADVANCED_BLOCK');
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE meeting_document'), expect.anything());
  });

  it('allows Simple Mode to apply an approved built-in template without Advanced capability', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', revision: 4 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: 3, document: layout, templateId: 'classic-bifold' })
      }),
      params()
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.layout).toEqual(BUILT_IN_TEMPLATES.find((template) => template.key === 'classic-bifold')?.layout);
    const updateCall = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE meeting_document'));
    expect(JSON.parse(String(updateCall?.[1]?.[5]))).toEqual(
      BUILT_IN_TEMPLATES.find((template) => template.key === 'classic-bifold')?.layout
    );
  });

  it('applies a persisted published system template in Simple Mode', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'system-template-1', version: 4, layout_json: DEFAULT_DOCUMENT_LAYOUT }] })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', revision: 4 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: 3, document: layout, templateId: 'system-template-1' })
      }),
      params()
    );
    expect(response.status).toBe(200);
    const templateQuery = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('FROM document_template t'));
    expect(templateQuery?.[0]).toContain("t.status = 'PUBLISHED'");
    expect((await response.json()).revision).toBe(4);
  });

  it('applies a selected template in Advanced Mode when the actor has Advanced capability', async () => {
    const selected = BUILT_IN_TEMPLATES.find((template) => template.key === 'classic-bifold')!;
    advancedCapabilityMock.mockReturnValue(true);
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', revision: 4 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({
          expectedRevision: 3,
          document: normalizeToAdvanced(layout),
          templateId: selected.key,
          mode: 'ADVANCED'
        })
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect((await response.json()).document.layout).toEqual(normalizeToAdvanced(selected.layout));
    const updateCall = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE meeting_document'));
    expect(JSON.parse(String(updateCall?.[1]?.[5]))).toEqual(normalizeToAdvanced(selected.layout));
  });

  it('allows applying a published custom template with advanced blocks in Simple Mode', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({ rows: [{ id: 'template-1', version: 7, layout_json: layout }] })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', revision: 4 }] })
      .mockResolvedValueOnce({});
    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: 3, document: layout, templateId: 'template-1' })
      }),
      params()
    );
    expect(response.status).toBe(200);
    const templateQuery = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('FROM document_template t'));
    expect(templateQuery?.[0]).toContain("t.status = 'PUBLISHED'");
    expect((await response.json()).revision).toBe(4);
  });

  it('returns a conflict and retains local state on a stale revision', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({});
    const response = await PUT(
      new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ expectedRevision: 2, document: layout }) }),
      params()
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('REVISION_CONFLICT');
    expect(body.currentRevision).toBe(3);
  });

  it('returns stable database errors for reads', async () => {
    queryMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce({});
    const response = await GET(new Request('http://localhost'), params());
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('INTERNAL_ERROR');
  });

  it('validates a draft without publishing it', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'meeting-1', meeting_date: '2026-09-20', meeting_type: 'SACRAMENT', ward_name: 'Freedom Park Ward' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    const validationLayout = BUILT_IN_TEMPLATES.find((template) => template.key === 'full-page-standard')!.layout;
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ document: validationLayout }) }), params());
    expect(response.status).toBe(200);
    expect((await response.json()).valid).toBe(true);
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
  });

  it('accepts section headings, simple lists, and announcement lists in Advanced Mode public preview', async () => {
    advancedCapabilityMock.mockReturnValue(true);
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'meeting-1', meeting_date: '2026-09-20', meeting_type: 'SACRAMENT', ward_name: 'Freedom Park Ward' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [documentRow] })
      .mockResolvedValueOnce({});
    const advanced = normalizeToAdvanced(layout);
    const previewLayout = {
      ...advanced,
      pages: advanced.pages.map((page) => ({
        ...page,
        regions: page.regions.map((region) => ({
          ...region,
          blocks: region.blocks.map((block, index) =>
            index === 0
              ? {
                  ...block,
                  type: 'SECTION_HEADING',
                  dataMode: 'MANUAL',
                  config: { title: 'Community', subtitle: 'This week', presentation: 'ACCENT' }
                }
              : index === 1
                ? {
                    ...block,
                    type: 'SIMPLE_LIST',
                    dataMode: 'MANUAL',
                    config: {
                      presentation: 'NUMBERED',
                      items: [
                        { id: '33333333-3333-4333-8333-333333333333', order: 0, text: 'Food drive' },
                        { id: '44444444-4444-4444-8444-444444444444', order: 1, text: 'Youth activity' }
                      ]
                    }
                  }
                : index === 2
                  ? {
                      ...block,
                      type: 'ANNOUNCEMENT_LIST',
                      dataMode: 'MANUAL',
                      config: {
                        presentation: 'COMPACT_ROWS',
                        items: [{ id: '22222222-2222-4222-8222-222222222222', order: 0, title: 'Ward dinner' }]
                      }
                    }
                  : block
          )
        }))
      }))
    } as typeof advanced;
    expect(() => parseAdvancedLayout(JSON.parse(JSON.stringify(previewLayout)))).not.toThrow();
    const publicLayout = downgradeToV1(projectAdvancedLayoutForPublic(previewLayout));
    expect(() =>
      validatePublicDocumentLayout(publicLayout, [
        'MEETING_PROGRAM',
        'ANNOUNCEMENT_LIST',
        'SECTION_HEADING',
        'SIMPLE_LIST',
        'ANNOUNCEMENTS',
        'PRESIDING_CONDUCTING',
        'MUSIC_LEADERS',
        'QR_CODE',
        'CUSTOM_LINK'
      ])
    ).not.toThrow();

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ mode: 'ADVANCED', document: previewLayout })
      }),
      params()
    );

    const result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result.publicSafe).toBe(true);
  });
});
