import { z } from 'zod';

import {
  BLOCK_WIDTHS,
  DATA_MODES,
  DIGITAL_BEHAVIORS,
  DOCUMENT_TYPES,
  FOLD_TYPES,
  LOCK_LEVELS,
  LOCK_PROPERTIES,
  ORIENTATIONS,
  PAPER_SIZES,
  PRINT_BEHAVIORS,
  SCHEMA_VERSIONS,
  THEME_FONT_FAMILIES,
  VISIBILITY_MODES
} from './constants';
import type { DocumentId } from './types';

export const documentIdSchema = z
  .string()
  .uuid()
  .transform((value) => value as DocumentId);
export const idSchema = documentIdSchema;
export const safeUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Only credential-free HTTPS links are allowed');
export const boundedText = (max: number) => z.string().max(max);

export const documentLockSchema = z
  .object({
    level: z.enum(LOCK_LEVELS),
    properties: z.array(z.enum(LOCK_PROPERTIES)).max(LOCK_PROPERTIES.length)
  })
  .strict()
  .superRefine((lock, context) => {
    if (new Set(lock.properties).size !== lock.properties.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['properties'], message: 'Lock properties must be unique' });
    }
    if (lock.level === 'NONE' && lock.properties.length > 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['properties'], message: 'NONE locks cannot contain properties' });
    }
    const allowed = {
      NONE: [],
      REGION: ['POSITION', 'SIZE', 'STYLE', 'VISIBILITY'],
      BLOCK: ['POSITION', 'SIZE', 'CONTENT', 'STYLE', 'VISIBILITY'],
      CONFIGURATION: ['CONTENT', 'STYLE']
    } as const;
    for (const property of lock.properties) {
      if (!(allowed[lock.level] as readonly string[]).includes(property)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['properties'], message: `${property} is not valid for ${lock.level}` });
      }
    }
  });

export const documentBlockBaseSchema = z
  .object({
    id: idSchema,
    width: z.enum(BLOCK_WIDTHS),
    dataMode: z.enum(DATA_MODES),
    visibility: z.enum(VISIBILITY_MODES),
    printBehavior: z.enum(PRINT_BEHAVIORS),
    digitalBehavior: z.enum(DIGITAL_BEHAVIORS),
    lock: documentLockSchema.optional()
  })
  .strict();

export const documentThemeSchema = z
  .object({
    fontFamily: z.enum(THEME_FONT_FAMILIES),
    baseFontSize: z.number().finite().min(8).max(32),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/)
  })
  .strict();

export function createDocumentRegionSchema(blockSchema: z.ZodTypeAny) {
  return z
    .object({
      id: idSchema,
      ratio: z.number().finite().positive().max(1),
      gutter: z.number().finite().min(0).max(72),
      blocks: z.array(blockSchema).max(100),
      lock: documentLockSchema.optional()
    })
    .strict();
}

export function createDocumentPageSchema(blockSchema: z.ZodTypeAny) {
  return z
    .object({
      id: idSchema,
      regions: z.array(createDocumentRegionSchema(blockSchema)).min(1).max(12),
      lock: documentLockSchema.optional()
    })
    .strict();
}

export function createDocumentLayoutSchema(blockSchema: z.ZodTypeAny, metadataSchema: z.ZodTypeAny = z.record(z.unknown()).optional()) {
  return z
    .object({
      id: idSchema,
      schemaVersion: z.literal(SCHEMA_VERSIONS[0]),
      documentType: z.literal(DOCUMENT_TYPES[0]),
      paper: z.enum(PAPER_SIZES),
      orientation: z.enum(ORIENTATIONS),
      fold: z.enum(FOLD_TYPES),
      theme: documentThemeSchema,
      metadata: metadataSchema,
      pages: z.array(createDocumentPageSchema(blockSchema)).min(1).max(8),
      lock: documentLockSchema.optional()
    })
    .strict()
    .superRefine((layout, context) => {
      const supported =
        layout.fold === 'HALF_SHEET'
          ? layout.paper === 'LETTER' && layout.orientation === 'PORTRAIT'
          : layout.fold === 'TRIFOLD'
            ? layout.orientation === 'LANDSCAPE'
            : true;
      if (!supported) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Unsupported paper, fold, and orientation combination' });
      for (const page of layout.pages) {
        const ratioTotal = page.regions.reduce((sum, region) => sum + region.ratio, 0);
        if (Math.abs(ratioTotal - 1) > 0.0001) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['pages'], message: 'Region ratios must total one per page' });
        }
      }
      const ids = [
        layout.id,
        ...layout.pages.flatMap((page) => [
          page.id,
          ...page.regions.flatMap((region) => [region.id, ...region.blocks.map((block) => block.id)])
        ])
      ];
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Document, page, region, and block IDs must be unique' });
      }
      if (JSON.stringify(layout).length > 250_000) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Serialized layout exceeds 250KB' });
      }
      for (const page of layout.pages)
        for (const region of page.regions)
          for (const block of region.blocks) {
            if (block.visibility === 'HIDE_WHEN_EMPTY' && block.dataMode === 'MANUAL') {
              context.addIssue({ code: z.ZodIssueCode.custom, message: 'HIDE_WHEN_EMPTY requires an automatic data mode' });
            }
            if (block.printBehavior === 'PRINT_ONLY' && block.digitalBehavior === 'LINK') {
              context.addIssue({ code: z.ZodIssueCode.custom, message: 'PRINT_ONLY blocks cannot use digital links' });
            }
          }
    });
}
