import { z } from 'zod';

import { parseDocumentLayout } from './schema';
import { BLOCK_WIDTHS } from './constants';
import type { DocumentBlock, DocumentLayout, DocumentRegion } from './types';
import type { ResolvedDocumentData } from './render-types';

export const ADVANCED_SCHEMA_VERSION = 2 as const;
export const COLUMN_COUNTS = [1, 2, 3] as const;
export type ColumnCount = (typeof COLUMN_COUNTS)[number];
export type ColumnRatio = '1/1' | '1/3+2/3' | '2/3+1/3';

export type StyleOverrides = {
  fontFamily?: 'SYSTEM_SANS' | 'SERIF' | 'MONOSPACE';
  fontSize?: number;
  align?: 'LEFT' | 'CENTER' | 'RIGHT';
  spacing?: number;
  border?: 'NONE' | 'SOLID' | 'DOTTED';
};

export type AdvancedBlock = DocumentBlock & {
  styleOverrides?: StyleOverrides;
  visibilityRule?: 'ALWAYS' | 'WHEN_DATA_EXISTS' | 'WHEN_PUBLIC';
  digitalOrder?: number;
};

export type RegionColumns = {
  count: ColumnCount;
  ratio: ColumnRatio;
  gutter: number;
  blockIds: string[][];
};

export type AdvancedRegion = Omit<DocumentRegion<AdvancedBlock>, 'blocks'> & {
  blocks: AdvancedBlock[];
  columns: RegionColumns;
};

export type AdvancedDocumentLayout = Omit<DocumentLayout, 'schemaVersion' | 'pages'> & {
  schemaVersion: typeof ADVANCED_SCHEMA_VERSION;
  pages: Array<Omit<DocumentLayout['pages'][number], 'regions'> & { regions: AdvancedRegion[] }>;
};

export const visibilityRuleSchema = z.enum(['ALWAYS', 'WHEN_DATA_EXISTS', 'WHEN_PUBLIC']);

export const styleOverridesSchema = z.object({
  fontFamily: z.enum(['SYSTEM_SANS', 'SERIF', 'MONOSPACE']).optional(),
  fontSize: z.number().finite().min(8).max(32).optional(),
  align: z.enum(['LEFT', 'CENTER', 'RIGHT']).optional(),
  spacing: z.number().finite().min(0).max(72).optional(),
  border: z.enum(['NONE', 'SOLID', 'DOTTED']).optional()
}).strict();

export const regionColumnsSchema = z.object({
  count: z.preprocess((value) => String(value), z.enum(['1', '2', '3']).transform(Number as unknown as (value: string) => ColumnCount)),
  ratio: z.enum(['1/1', '1/3+2/3', '2/3+1/3']),
  gutter: z.number().finite().min(0).max(72),
  blockIds: z.array(z.array(z.string().uuid())).max(3)
}).strict();

const advancedExtras = new Set(['columns', 'styleOverrides', 'visibilityRule', 'digitalOrder']);

function stripAdvancedFields(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(stripAdvancedFields);
  const source = input as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (advancedExtras.has(key)) continue;
    output[key] = key === 'schemaVersion' && value === ADVANCED_SCHEMA_VERSION ? 1 : stripAdvancedFields(value);
  }
  return output;
}

function defaultColumns(region: DocumentRegion): RegionColumns {
  return { count: 1, ratio: '1/1', gutter: region.gutter, blockIds: [region.blocks.map((block) => block.id)] };
}

function validateColumns(region: AdvancedRegion): void {
  const { columns } = region;
  if (columns.count === 1 && columns.ratio !== '1/1') throw new Error('One-column regions must use the 1/1 ratio');
  if (columns.count === 3 && columns.ratio !== '1/1') throw new Error('Three-column regions use equal columns');
  if (columns.count === 2 && !['1/1', '1/3+2/3', '2/3+1/3'].includes(columns.ratio)) throw new Error('Two-column regions require a supported split ratio');
  if (columns.gutter !== region.gutter) throw new Error('Column gutter must match the region gutter');
  if (columns.blockIds.length !== columns.count) throw new Error('Column containers must match column count');
  const blockIds = new Set<string>(region.blocks.map((block) => block.id));
  const assigned = columns.blockIds.flat();
  if (assigned.length !== blockIds.size || new Set(assigned).size !== assigned.length || assigned.some((id) => !blockIds.has(id))) {
    throw new Error('Column block assignments must contain each region block exactly once');
  }
}

export function normalizeToAdvanced(input: unknown): AdvancedDocumentLayout {
  const source = input as { schemaVersion?: unknown } | null;
  const base = parseDocumentLayout(stripAdvancedFields(input));
  const sourcePages = source && typeof source === 'object' && Array.isArray((source as { pages?: unknown }).pages) ? (source as { pages: unknown[] }).pages : [];
  const pages = base.pages.map((page, pageIndex) => ({
    ...page,
    regions: page.regions.map((region, regionIndex) => {
      const sourcePage = sourcePages[pageIndex] as { regions?: unknown[] } | undefined;
      const sourceRegions = sourcePage && Array.isArray(sourcePage.regions) ? sourcePage.regions : [];
      const sourceRegion = sourceRegions[regionIndex];
      const sourceRegionObject = sourceRegion && typeof sourceRegion === 'object' ? sourceRegion as { columns?: unknown } : undefined;
      const parsedColumns = sourceRegionObject?.columns !== undefined && source?.schemaVersion === ADVANCED_SCHEMA_VERSION
        ? regionColumnsSchema.parse(sourceRegionObject.columns)
        : (() => { const result = regionColumnsSchema.safeParse(sourceRegionObject?.columns); return result.success ? result.data : defaultColumns(region); })();
      const advancedRegion: AdvancedRegion = {
        ...region,
        blocks: region.blocks.map((block, blockIndex) => {
          const sourceBlocks = sourceRegionObject && Array.isArray((sourceRegionObject as { blocks?: unknown[] }).blocks) ? (sourceRegionObject as { blocks: unknown[] }).blocks : [];
          const sourceBlock = sourceBlocks[blockIndex];
          if (!sourceBlock || typeof sourceBlock !== 'object') return block as AdvancedBlock;
          const value = sourceBlock as Record<string, unknown>;
          return { ...block, ...(value.styleOverrides !== undefined ? { styleOverrides: value.styleOverrides } : {}), ...(value.visibilityRule !== undefined ? { visibilityRule: value.visibilityRule } : {}), ...(value.digitalOrder !== undefined ? { digitalOrder: value.digitalOrder } : {}) } as AdvancedBlock;
        }),
        columns: parsedColumns
      };
      validateColumns(advancedRegion);
      return advancedRegion;
    })
  }));
  return { ...base, schemaVersion: ADVANCED_SCHEMA_VERSION, pages } as AdvancedDocumentLayout;
}

export function downgradeToV1(layout: AdvancedDocumentLayout): DocumentLayout {
  if (layout.schemaVersion !== ADVANCED_SCHEMA_VERSION) throw new Error('Only schema-v2 layouts can be downgraded');
  return parseDocumentLayout(stripAdvancedFields(layout));
}

export function mergeSimpleIntoAdvanced(previous: AdvancedDocumentLayout, simple: DocumentLayout): AdvancedDocumentLayout {
  const next = structuredClone(previous);
  next.paper = simple.paper;
  next.orientation = simple.orientation;
  next.fold = simple.fold;
  next.theme = simple.theme;
  const simpleBlocks = new Map(allSimpleBlocks(simple).map((block) => [block.id, block]));
  next.pages = next.pages.map((page) => ({
    ...page,
    regions: page.regions.map((region) => ({
      ...region,
      blocks: region.blocks.map((block) => {
        const replacement = simpleBlocks.get(block.id);
        return replacement ? { ...block, width: replacement.width, dataMode: replacement.dataMode, visibility: replacement.visibility, printBehavior: replacement.printBehavior, digitalBehavior: replacement.digitalBehavior, config: replacement.config, lock: block.lock } : block;
      })
    }))
  })) as AdvancedDocumentLayout['pages'];
  return parseAdvancedLayout(next as unknown);
}

function allSimpleBlocks(layout: DocumentLayout): DocumentBlock[] {
  return layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks));
}

export function parseAdvancedLayout(input: unknown): AdvancedDocumentLayout {
  const layout = normalizeToAdvanced(input);
  for (const page of layout.pages) for (const region of page.regions) {
    validateColumns(region);
    for (const block of region.blocks) {
      if (block.width && !BLOCK_WIDTHS.includes(block.width)) throw new Error('Unsupported block width');
      if (block.styleOverrides) styleOverridesSchema.parse(block.styleOverrides);
      if (block.visibilityRule !== undefined) visibilityRuleSchema.parse(block.visibilityRule);
      if (block.digitalOrder !== undefined && (!Number.isInteger(block.digitalOrder) || block.digitalOrder < 0)) throw new Error('Invalid digital order');
    }
  }
  return layout;
}

export function isAdvancedLayout(input: unknown): input is AdvancedDocumentLayout {
  return Boolean(input && typeof input === 'object' && (input as { schemaVersion?: unknown }).schemaVersion === ADVANCED_SCHEMA_VERSION);
}

export function projectAdvancedLayoutForOutput(
  layout: AdvancedDocumentLayout,
  target: 'PUBLIC' | 'PRINT' | 'DIGITAL',
  data?: ResolvedDocumentData
): DocumentLayout {
  const projected = structuredClone(layout);
  projected.pages = projected.pages.map((page) => ({
    ...page,
    regions: page.regions.map((region) => ({
      ...region,
      blocks: region.blocks
        .filter((block) => block.visibility !== 'HIDDEN')
        .filter((block) => target !== 'PRINT' || block.printBehavior !== 'DIGITAL_ONLY')
        .filter((block) => target !== 'DIGITAL' || block.printBehavior !== 'PRINT_ONLY')
        .filter((block) => block.visibilityRule !== 'WHEN_PUBLIC' || target === 'PUBLIC')
        .filter((block) => {
          if (block.visibilityRule !== 'WHEN_DATA_EXISTS') return true;
          if (!data) return true;
          if (block.type === 'MEETING_PROGRAM') return data.meetingItems.length > 0;
          const value = data.values[block.type];
          return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '';
        })
        .sort((a, b) => target === 'DIGITAL'
          ? (a.digitalOrder ?? Number.MAX_SAFE_INTEGER) - (b.digitalOrder ?? Number.MAX_SAFE_INTEGER)
          : 0)
    }))
  }));
  return downgradeToV1(projected);
}

export function projectAdvancedLayoutForPublic(layout: AdvancedDocumentLayout): DocumentLayout {
  return projectAdvancedLayoutForOutput(layout, 'PUBLIC');
}
