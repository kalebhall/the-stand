import { getRegisteredBlockDefinition } from './registry';
import type { DocumentBlock, DocumentLayout } from './types';
import type { ResolvedDocumentData } from './render-types';

export class PublicSafetyError extends Error {
  code = 'UNSAFE_PUBLIC_DOCUMENT' as const;
}

export function validatePublicDocumentLayout(
  layout: DocumentLayout,
  explicitPublicBlockTypes: readonly string[] = []
): void {
  const explicit = new Set(explicitPublicBlockTypes);
  for (const block of allBlocks(layout)) {
    const definition = getRegisteredBlockDefinition(layout.documentType, block.type);
    if (definition.publicationSafety === 'INTERNAL_ONLY') {
      throw new PublicSafetyError(`Block ${block.type} is not allowed in public output`);
    }
    if (definition.publicationSafety === 'PUBLIC_WITH_EXPLICIT_FIELDS' && !explicit.has(block.type)) {
      throw new PublicSafetyError(`Block ${block.type} requires explicit public approval`);
    }
  }
}

export function allBlocks(layout: DocumentLayout): DocumentBlock[] {
  return layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks));
}

export function resolvePublicData(
  layout: DocumentLayout,
  data: ResolvedDocumentData,
  explicitPublicBlockTypes: readonly string[] = []
): ResolvedDocumentData {
  validatePublicDocumentLayout(layout, explicitPublicBlockTypes);
  return {
    ...data,
    values: Object.fromEntries(
      Object.entries(data.values).filter(([type]) => explicitPublicBlockTypes.includes(type) || type !== 'WARD_LEADERSHIP')
    )
  };
}
