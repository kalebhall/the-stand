import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DEFAULT_DOCUMENT_LAYOUT,
  documentBlockSchema,
  documentLayoutSchema,
  documentPageSchema,
  createPublicDocumentLayoutSchema,
  publicDocumentLayoutSchema,
  templateMetadataSchema,
  templateSchema,
  TEMPLATE_SCOPES,
  TEMPLATE_STATUSES,
  parseDocumentLayout
} from './schema';
import type {
  DocumentBlock,
  DocumentBlockBase,
  DocumentId,
  DocumentLayout,
  DocumentPage,
  DocumentRegion,
  RegistryDocumentBlock
} from './types';
import { sacramentProgramLayoutSchema, sacramentProgramRegistry } from './sacrament-program';
import { createPublicDocumentBlockSchema } from './registry';

const validLayout = {
  ...DEFAULT_DOCUMENT_LAYOUT,
  id: '11111111-1111-4111-8111-111111111111'
};

describe('document designer schema', () => {
  it('uses the registry-backed public block and page schemas', () => {
    const base = {
      ...validLayout.pages[0].regions[0].blocks[0],
      type: 'WARD_NAME',
      dataMode: 'AUTO',
      config: { text: 'Oak Ward' }
    };
    expect(documentBlockSchema.safeParse(base).success).toBe(true);
    expect(documentBlockSchema.safeParse({ ...base, dataMode: 'MANUAL' }).success).toBe(false);
    expect(documentBlockSchema.safeParse({ ...base, config: { text: '<script>' } }).success).toBe(false);
    expect(
      documentPageSchema.safeParse({
        id: validLayout.pages[0].id,
        regions: [
          {
            id: validLayout.pages[0].regions[0].id,
            ratio: 1,
            gutter: 0,
            blocks: [{ ...base, type: 'MEETING_PROGRAM', dataMode: 'MANUAL', config: { items: [] } }]
          }
        ]
      }).success
    ).toBe(true);
  });

  it('enforces the public publication boundary', () => {
    for (const type of ['WARD_LEADERSHIP', 'MISSIONARIES_ASSIGNED']) {
      const privateLayout = structuredClone(validLayout);
      const privateBlock = privateLayout.pages[0].regions[0].blocks[0] as unknown as Record<string, unknown>;
      privateBlock.type = type;
      privateBlock.dataMode = 'AUTO';
      privateBlock.config = { text: 'Private' };
      expect(publicDocumentLayoutSchema.safeParse(privateLayout).success).toBe(false);
    }

    const explicitBlock = structuredClone(validLayout);
    const block = explicitBlock.pages[0].regions[0].blocks[0] as unknown as Record<string, unknown>;
    block.type = 'MEETING_PROGRAM';
    block.dataMode = 'MANUAL';
    block.config = { items: [] };
    expect(publicDocumentLayoutSchema.safeParse(explicitBlock).success).toBe(false);
    expect(createPublicDocumentLayoutSchema(['MEETING_PROGRAM']).safeParse(explicitBlock).success).toBe(true);
    block.visibility = 'HIDDEN';
    expect(createPublicDocumentLayoutSchema(['MEETING_PROGRAM']).safeParse(explicitBlock).success).toBe(false);
  });

  it('types the public registry without internal-only block keys', () => {
    const publicBlockSchema = createPublicDocumentBlockSchema(sacramentProgramRegistry);
    type PublicBlockInput = z.input<typeof publicBlockSchema>;
    const publicType: PublicBlockInput['type'] = 'DOCUMENT_TITLE';
    // @ts-expect-error Internal-only blocks must be excluded from the public schema input type.
    const internalType: PublicBlockInput['type'] = 'WARD_LEADERSHIP';

    expect(publicType).toBe('DOCUMENT_TITLE');
    expect(internalType).toBe('WARD_LEADERSHIP');
    expect(
      publicBlockSchema.safeParse({ ...validLayout.pages[0].regions[0].blocks[0], type: 'WARD_LEADERSHIP', config: { text: 'Private' } })
        .success
    ).toBe(false);
  });

  it('does not allow arbitrary metadata across the public boundary', () => {
    expect(
      publicDocumentLayoutSchema.safeParse({ ...validLayout, metadata: { privateNotes: 'leadership-only', userId: 'secret' } }).success
    ).toBe(false);
    expect(publicDocumentLayoutSchema.safeParse({ ...validLayout, metadata: {} }).success).toBe(true);
  });

  it('parses a minimal valid sacrament layout', () => {
    const result = documentLayoutSchema.safeParse(validLayout);

    expect(result.success).toBe(true);
    const parsed = parseDocumentLayout(validLayout);
    const documentId: DocumentId = parsed.id;
    expect(documentId).toBe(validLayout.id);
    expect(parsed.documentType).toBe('SACRAMENT_PROGRAM');
    expect(parsed.pages[0].id).toBe(validLayout.pages[0].id);
    expect(parsed.pages[0].regions[0].id).toBe(validLayout.pages[0].regions[0].id);
    expect(parsed.pages[0].regions[0].blocks[0].id).toBe(validLayout.pages[0].regions[0].blocks[0].id);
  });

  it('canonical layout schema accepts registered blocks and rejects unknown registered config', () => {
    const registeredLayout = structuredClone(validLayout);
    const blocks = registeredLayout.pages[0].regions[0].blocks as unknown as Array<Record<string, unknown>>;
    blocks[0] = {
      ...blocks[0],
      type: 'WARD_NAME',
      dataMode: 'AUTO',
      config: { text: 'Oak Ward' }
    };
    blocks.push({
      ...blocks[0],
      id: '22222222-2222-4222-8222-222222222222',
      type: 'MEETING_PROGRAM',
      dataMode: 'MANUAL',
      config: { items: [] }
    });
    expect(documentLayoutSchema.safeParse(registeredLayout).success).toBe(true);

    blocks[0].config = { text: 'Oak Ward', unexpected: true };
    expect(documentLayoutSchema.safeParse(registeredLayout).success).toBe(false);
  });

  it('rejects executable and style payloads in structured text', () => {
    const schema = sacramentProgramLayoutSchema;
    for (const text of ['javascript:alert(1)', 'style=color:red', 'script:alert(1)', 'onerror=alert(1)']) {
      const layout = structuredClone(validLayout);
      const blocks = layout.pages[0].regions[0].blocks as unknown as Array<Record<string, unknown>>;
      blocks[0] = {
        ...blocks[0],
        type: 'CUSTOM_TEXT',
        config: { text }
      };
      expect(schema.safeParse(layout).success).toBe(false);
    }
    const ordinary = structuredClone(validLayout);
    const ordinaryBlocks = ordinary.pages[0].regions[0].blocks as unknown as Array<Record<string, unknown>>;
    ordinaryBlocks[0] = {
      ...ordinaryBlocks[0],
      type: 'CUSTOM_TEXT',
      config: { text: 'Style and script are useful words in ordinary prose.' }
    };
    expect(schema.safeParse(ordinary).success).toBe(true);
  });

  it('preserves registry block keys as their type discriminants', () => {
    type CustomAnnouncementBlock = DocumentBlockBase<'CUSTOM_ANNOUNCEMENT'> & {
      config: { announcement: string };
    };
    type RegisteredBlock = RegistryDocumentBlock<{
      CUSTOM_ANNOUNCEMENT: CustomAnnouncementBlock;
    }>;

    const block: RegisteredBlock = {
      id: DEFAULT_DOCUMENT_LAYOUT.id,
      type: 'CUSTOM_ANNOUNCEMENT',
      width: 'FULL',
      dataMode: 'MANUAL',
      visibility: 'VISIBLE',
      printBehavior: 'PRINT_AND_DIGITAL',
      digitalBehavior: 'NORMAL',
      config: { announcement: 'Welcome' }
    };
    // @ts-expect-error Registry keys must agree with their block discriminants.
    const mismatchedBlock: RegisteredBlock = { ...block, type: 'OTHER' };

    expect(block.type).toBe('CUSTOM_ANNOUNCEMENT');
    expect(mismatchedBlock).toBeDefined();
  });

  it('keeps the production block union discriminated by type', () => {
    const block = {} as DocumentBlock;
    if (block.type === 'MEETING_PROGRAM') {
      const items = block.config.items;
      expect(items).toBeDefined();
    }
    // @ts-expect-error An arbitrary block type is not part of the production union.
    const unknownBlock: DocumentBlock = { ...block, type: 'UNKNOWN_BLOCK' };
    expect(unknownBlock).toBeDefined();
  });

  it('supports custom blocks throughout public region, page, and layout types', () => {
    type CustomAnnouncementBlock = DocumentBlockBase<'CUSTOM_ANNOUNCEMENT'> & {
      config: { announcement: string };
    };
    const region: DocumentRegion<CustomAnnouncementBlock> = {
      id: DEFAULT_DOCUMENT_LAYOUT.id,
      ratio: 1,
      gutter: 0,
      blocks: []
    };
    const page: DocumentPage<CustomAnnouncementBlock> = { id: DEFAULT_DOCUMENT_LAYOUT.id, regions: [region] };
    const layoutPages: DocumentPage<CustomAnnouncementBlock>[] = [page];
    const layout: Pick<DocumentLayout<object, CustomAnnouncementBlock>, 'pages'> = { pages: layoutPages };
    const pages: DocumentPage<CustomAnnouncementBlock>[] = layout.pages;

    expect(page.regions[0]).toBe(region);
    expect(pages).toBe(layoutPages);
  });

  it('rejects unknown block types', () => {
    const layout = structuredClone(validLayout);
    const blocks = layout.pages[0].regions[0].blocks as unknown as Array<Record<string, unknown>>;
    blocks.push({
      id: '22222222-2222-4222-8222-222222222222',
      type: 'UNKNOWN_BLOCK',
      width: 'FULL',
      dataMode: 'MANUAL',
      visibility: 'VISIBLE',
      printBehavior: 'PRINT_AND_DIGITAL',
      digitalBehavior: 'NORMAL',
      config: {}
    });

    expect(documentLayoutSchema.safeParse(layout).success).toBe(false);
  });

  it('rejects malformed IDs, unsafe links, and unsupported values', () => {
    const malformedId = { ...validLayout, id: 'not-an-id' };
    expect(documentLayoutSchema.safeParse(malformedId).success).toBe(false);

    const unsafeLink = structuredClone(validLayout);
    const blocks = unsafeLink.pages[0].regions[0].blocks as unknown as Array<Record<string, unknown>>;
    blocks[0] = {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'CUSTOM_LINK',
      width: 'FULL',
      dataMode: 'MANUAL',
      visibility: 'VISIBLE',
      printBehavior: 'PRINT_AND_DIGITAL',
      digitalBehavior: 'LINK',
      config: { label: 'Unsafe', href: 'javascript:alert(1)' }
    };
    expect(documentLayoutSchema.safeParse(unsafeLink).success).toBe(false);

    expect(documentLayoutSchema.safeParse({ ...validLayout, paper: 'LEGAL' }).success).toBe(false);
    expect(documentLayoutSchema.safeParse({ ...validLayout, fold: 'TRIFOLD', paper: 'A4', orientation: 'PORTRAIT' }).success).toBe(false);
  });

  it('keeps the exported document ID validator UUID-safe', () => {
    expect(documentLayoutSchema.safeParse({ ...validLayout, id: 'arbitrary-branded-string' }).success).toBe(false);
  });

  it('rejects invalid geometry, theme fonts, and unknown configuration', () => {
    expect(documentLayoutSchema.safeParse({ ...validLayout, theme: { ...validLayout.theme, fontFamily: 'Comic Sans' } }).success).toBe(
      false
    );

    const invalidGeometry = structuredClone(validLayout);
    invalidGeometry.pages[0].regions[0].gutter = -1;
    expect(documentLayoutSchema.safeParse(invalidGeometry).success).toBe(false);

    const unknownConfiguration = structuredClone(validLayout);
    const block = unknownConfiguration.pages[0].regions[0].blocks[0] as unknown as Record<string, unknown>;
    block.config = { unexpected: true };
    expect(documentLayoutSchema.safeParse(unknownConfiguration).success).toBe(false);
  });

  it('rejects oversized configuration and unsupported schema versions', () => {
    const oversized = structuredClone(validLayout);
    oversized.pages[0].regions[0].blocks[0].config = { text: 'x'.repeat(10_001) };
    expect(documentLayoutSchema.safeParse(oversized).success).toBe(false);
    expect(documentLayoutSchema.safeParse({ ...validLayout, schemaVersion: 99 }).success).toBe(false);
  });

  it('exports and validates template metadata and status values', () => {
    expect(TEMPLATE_SCOPES).toContain('WARD');
    expect(TEMPLATE_STATUSES).toContain('PUBLISHED');
    expect(templateMetadataSchema.safeParse({ name: 'Bulletin', scope: 'WARD', status: 'DRAFT' }).success).toBe(true);
    expect(templateSchema.safeParse({ ...validLayout, metadata: { name: 'Bulletin', scope: 'WARD', status: 'DRAFT' } }).success).toBe(true);
    expect(templateMetadataSchema.safeParse({ name: '', scope: 'WARD', status: 'DRAFT' }).success).toBe(false);
  });

  it('rejects duplicate IDs anywhere in the layout and accepts only branded UUID boundaries', () => {
    const duplicate = structuredClone(validLayout);
    const duplicateBlock = duplicate.pages[0].regions[0].blocks[0] as unknown as Record<string, unknown>;
    duplicateBlock.id = duplicate.id;
    expect(documentLayoutSchema.safeParse(duplicate).success).toBe(false);
    expect(documentLayoutSchema.safeParse({ ...validLayout, id: '11111111-1111-4111-8111-11111111111z' }).success).toBe(false);
  });

  it('requires region ratios to total one', () => {
    const invalid = structuredClone(validLayout);
    invalid.pages[0].regions.push({ ...invalid.pages[0].regions[0], ratio: 0.2 });
    expect(documentLayoutSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unsupported paper, fold, and orientation combinations', () => {
    expect(documentLayoutSchema.safeParse({ ...validLayout, paper: 'A4', fold: 'HALF_SHEET', orientation: 'PORTRAIT' }).success).toBe(
      false
    );
    expect(documentLayoutSchema.safeParse({ ...validLayout, paper: 'LETTER', fold: 'TRIFOLD', orientation: 'PORTRAIT' }).success).toBe(
      false
    );
  });

  it('validates lock semantics and duplicate lock properties', () => {
    expect(documentLayoutSchema.safeParse({ ...validLayout, lock: { level: 'NONE', properties: ['CONTENT'] } }).success).toBe(false);
    expect(documentLayoutSchema.safeParse({ ...validLayout, lock: { level: 'BLOCK', properties: ['CONTENT', 'CONTENT'] } }).success).toBe(
      false
    );
    expect(documentLayoutSchema.safeParse({ ...validLayout, lock: { level: 'REGION', properties: ['CONTENT'] } }).success).toBe(false);
  });

  it('requires HTTPS URLs and bounds serialized layout size', () => {
    const httpImage = structuredClone(validLayout);
    const httpBlock = httpImage.pages[0].regions[0].blocks[0] as unknown as Record<string, unknown>;
    httpBlock.type = 'IMAGE';
    httpBlock.config = { src: 'http://example.com/a.png', alt: 'A' };
    expect(documentLayoutSchema.safeParse(httpImage).success).toBe(false);
    const huge = structuredClone(validLayout);
    const hugeBlock = huge.pages[0].regions[0].blocks[0] as unknown as Record<string, unknown>;
    hugeBlock.type = 'CUSTOM_TEXT';
    hugeBlock.config = { text: 'x'.repeat(10_001) };
    expect(documentLayoutSchema.safeParse(huge).success).toBe(false);
  });

  it('rejects layouts whose aggregate serialized configuration is too large', () => {
    const huge = structuredClone(validLayout);
    const region = huge.pages[0].regions[0] as unknown as Record<string, unknown>;
    const baseBlock = huge.pages[0].regions[0].blocks[0] as unknown as Record<string, unknown>;
    region.blocks = Array.from({ length: 30 }, (_, index) => ({
      ...baseBlock,
      id: `22222222-2222-4222-8222-${String(index + 10).padStart(12, '0')}`,
      type: 'CUSTOM_TEXT',
      config: { text: 'x'.repeat(10_000) }
    }));
    expect(documentLayoutSchema.safeParse(huge).success).toBe(false);
  });

  it('rejects inconsistent visibility, output behavior, and data modes', () => {
    const invalid = structuredClone(validLayout);
    const invalidBlock = invalid.pages[0].regions[0].blocks[0] as unknown as Record<string, unknown>;
    invalidBlock.visibility = 'HIDE_WHEN_EMPTY';
    invalidBlock.dataMode = 'MANUAL';
    expect(documentLayoutSchema.safeParse(invalid).success).toBe(false);
    invalidBlock.visibility = 'VISIBLE';
    invalidBlock.dataMode = 'AUTO';
    invalidBlock.printBehavior = 'PRINT_ONLY';
    invalidBlock.digitalBehavior = 'LINK';
    expect(documentLayoutSchema.safeParse(invalid).success).toBe(false);
  });
});
