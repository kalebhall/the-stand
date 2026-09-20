import { z } from 'zod';

import {
  BLOCK_TYPES,
  DEFAULT_BLOCK_ID,
  DEFAULT_DOCUMENT_ID,
  DEFAULT_PAGE_ID,
  DEFAULT_REGION_ID,
  TEMPLATE_SCOPES,
  TEMPLATE_STATUSES
} from './constants';
import type { DocumentLayout } from './types';
import { sacramentProgramRegistry } from './sacrament-program';
import { createDocumentBlockSchema, createPublicDocumentBlockSchema } from './registry';
import { createDocumentLayoutSchema, createDocumentPageSchema, createDocumentRegionSchema, boundedText, idSchema } from './primitives';

export { TEMPLATE_SCOPES, TEMPLATE_STATUSES } from './constants';

export const documentBlockSchema = createDocumentBlockSchema(sacramentProgramRegistry);

export {
  createDocumentLayoutSchema,
  createDocumentPageSchema,
  createDocumentRegionSchema,
  documentLockSchema,
  documentThemeSchema
} from './primitives';

export const documentRegionSchema = createDocumentRegionSchema(documentBlockSchema);
export const documentPageSchema = createDocumentPageSchema(documentBlockSchema);

export const documentLayoutSchema = createDocumentLayoutSchema(createDocumentBlockSchema(sacramentProgramRegistry));

export function createPublicDocumentLayoutSchema(explicitPublicFields: readonly string[] = []) {
  return createDocumentLayoutSchema(
    createPublicDocumentBlockSchema(sacramentProgramRegistry, explicitPublicFields),
    z.object({}).strict().optional()
  );
}

export const publicDocumentLayoutSchema = createPublicDocumentLayoutSchema();

export const templateMetadataSchema = z
  .object({
    name: boundedText(200).min(1),
    description: boundedText(2_000).optional(),
    scope: z.enum(TEMPLATE_SCOPES),
    status: z.enum(TEMPLATE_STATUSES)
  })
  .strict();

export const templateSchema = documentLayoutSchema.and(z.object({ metadata: templateMetadataSchema }));

export const DEFAULT_DOCUMENT_LAYOUT = {
  id: idSchema.parse(DEFAULT_DOCUMENT_ID),
  schemaVersion: 1,
  documentType: 'SACRAMENT_PROGRAM',
  paper: 'LETTER',
  orientation: 'PORTRAIT',
  fold: 'BIFOLD',
  theme: {
    fontFamily: 'SYSTEM_SANS',
    baseFontSize: 12,
    accentColor: '#1f2937'
  },
  pages: [
    {
      id: idSchema.parse(DEFAULT_PAGE_ID),
      regions: [
        {
          id: idSchema.parse(DEFAULT_REGION_ID),
          ratio: 1,
          gutter: 0,
          blocks: [
            {
              id: idSchema.parse(DEFAULT_BLOCK_ID),
              type: 'DOCUMENT_TITLE',
              width: 'FULL',
              dataMode: 'AUTO',
              visibility: 'VISIBLE',
              printBehavior: 'PRINT_AND_DIGITAL',
              digitalBehavior: 'NORMAL',
              config: { text: 'Sacrament Meeting' }
            }
          ]
        }
      ]
    }
  ]
} satisfies DocumentLayout;

export function parseDocumentLayout(input: unknown): DocumentLayout {
  return documentLayoutSchema.parse(input);
}

export type DocumentLayoutInput = z.input<typeof documentLayoutSchema>;
export type DocumentBlockInput = z.input<typeof documentBlockSchema>;
export const supportedBlockTypes = BLOCK_TYPES;
