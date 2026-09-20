import { documentLayoutSchema } from './schema';
import type { DocumentLayout } from './types';

export type InheritedDocument = {
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  layout: DocumentLayout;
  theme: DocumentLayout['theme'];
};

export function inheritTemplate(layoutInput: unknown, sourceTemplateId: string | null, sourceTemplateVersion: number | null): InheritedDocument {
  const layout = documentLayoutSchema.parse(structuredClone(layoutInput));
  return {
    sourceTemplateId,
    sourceTemplateVersion,
    layout,
    theme: layout.theme
  };
}
