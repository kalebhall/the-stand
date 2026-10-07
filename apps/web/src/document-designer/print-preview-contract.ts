import { renderDocumentHtml } from './renderer';
import { resolveDocumentData, type SafeMeetingSource } from './data-resolver';
import { validatePrintLayout } from './overflow';
import type { PrintPreviewMode, PrintValidationResult } from './print-types';
import type { DocumentLayout } from './types';
import type { AdvancedDocumentLayout } from './advanced-schema';

export function buildPrintPreview(
  inputLayout: unknown,
  source: SafeMeetingSource,
  mode: PrintPreviewMode = 'FRONT'
): { layout: DocumentLayout | AdvancedDocumentLayout; validation: PrintValidationResult; html: string } {
  const { layout, data } = resolveDocumentData(inputLayout, source, { target: 'PRINT', preserveAdvancedLayout: true });
  const validation = validatePrintLayout(layout, data);
  const html = renderDocumentHtml({ layout, data, target: 'PRINT', public: false }).html;
  return { layout, validation: { ...validation, foldGuidance: mode === 'FOLDED' ? validation.foldGuidance : [] }, html };
}
