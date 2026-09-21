import { allBlocks, resolvePublicData, validatePublicDocumentLayout } from './public-safety';
import { validatePrintLayout } from './overflow';
import type { PrintIssue } from './print-types';
import { safeUrlSchema } from './primitives';
import { validateMediaMetadata } from './media-validation';
import { parseDocumentLayout } from './schema';
import type { ResolvedDocumentData } from './render-types';
import type { DocumentLayout } from './types';

export type PublicationIssueSeverity = 'ERROR' | 'WARNING';
export type PublicationIssue = {
  readonly code: string;
  readonly severity: PublicationIssueSeverity;
  readonly message: string;
  readonly path?: string;
  readonly blockId?: string;
  readonly acknowledgementRequired?: boolean;
};

export type PublicationValidationResult = {
  readonly valid: boolean;
  readonly errors: readonly PublicationIssue[];
  readonly warnings: readonly PublicationIssue[];
  readonly requiresWarningAcknowledgement: boolean;
  readonly warningCodes: readonly string[];
  readonly layout?: DocumentLayout;
  readonly print: ReturnType<typeof validatePrintLayout> | null;
};

export type PublicationValidationOptions = {
  readonly explicitPublicBlockTypes?: readonly string[];
  readonly acknowledgedWarningCodes?: readonly string[];
};

function issue(code: string, message: string, severity: PublicationIssueSeverity, extra: Omit<PublicationIssue, 'code' | 'message' | 'severity'> = {}): PublicationIssue {
  return { code, message, severity, ...extra };
}

function fromPrintIssue(printIssue: PrintIssue): PublicationIssue {
  return issue(printIssue.code, printIssue.message, printIssue.severity, {
    blockId: printIssue.blockId,
    path: printIssue.path,
    acknowledgementRequired: printIssue.severity === 'WARNING'
  });
}

function validPublicLink(href: string): boolean {
  return safeUrlSchema.safeParse(href).success;
}

function validatePublicContent(layout: DocumentLayout, data: ResolvedDocumentData): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  for (const block of allBlocks(layout)) {
    if (block.visibility === 'HIDDEN') continue;
    if (block.type === 'IMAGE') {
      const asset = block.config.assetId ? data.media?.[block.config.assetId] : undefined;
      if (!asset) issues.push(issue('IMAGE_UNAVAILABLE', 'Image asset is unavailable for public output.', 'ERROR', { blockId: block.id }));
      else {
        try {
          validateMediaMetadata({ altText: asset.altText, isDecorative: asset.isDecorative });
        } catch (error) {
          issues.push(issue(error instanceof Error && 'code' in error ? String(error.code) : 'ALT_TEXT_REQUIRED', error instanceof Error ? error.message : 'Non-decorative images require alt text.', 'ERROR', { blockId: block.id }));
        }
      }
    }
    if (block.type === 'QR_CODE' || block.type === 'CUSTOM_LINK') {
      const href = block.config.href;
      if (!validPublicLink(href)) issues.push(issue('INVALID_PUBLIC_LINK', 'Public links must use an absolute HTTP or HTTPS URL.', 'ERROR', { blockId: block.id }));
    }
    if (block.type === 'CUSTOM_TEXT' && !block.config.text.trim()) issues.push(issue('EMPTY_CUSTOM_TEXT', 'Custom public text cannot be empty.', 'WARNING', { blockId: block.id, acknowledgementRequired: false }));
  }
  return issues;
}

export function validatePublication(input: { layout: unknown; data: ResolvedDocumentData }, options: PublicationValidationOptions = {}): PublicationValidationResult {
  const errors: PublicationIssue[] = [];
  const warnings: PublicationIssue[] = [];
  let layout: DocumentLayout | undefined;
  let print: ReturnType<typeof validatePrintLayout> | null = null;
  try {
    layout = parseDocumentLayout(input.layout);
  } catch (error) {
    errors.push(issue('INVALID_LAYOUT', error instanceof Error ? error.message : 'Invalid document layout.', 'ERROR'));
  }
  if (layout) {
    let publicData = input.data;
    try {
      validatePublicDocumentLayout(layout, options.explicitPublicBlockTypes ?? []);
      publicData = resolvePublicData(layout, input.data, options.explicitPublicBlockTypes ?? []);
    } catch (error) {
      errors.push(issue('UNSAFE_PUBLIC_DOCUMENT', error instanceof Error ? error.message : 'Document contains content that cannot be published.', 'ERROR'));
    }
    for (const contentIssue of validatePublicContent(layout, publicData)) (contentIssue.severity === 'ERROR' ? errors : warnings).push(contentIssue);
    print = validatePrintLayout(layout, publicData);
    for (const printIssue of [...print.errors, ...print.warnings]) (printIssue.severity === 'ERROR' ? errors : warnings).push(fromPrintIssue(printIssue));
  }
  const warningCodes = [...new Set(warnings.filter(({ acknowledgementRequired }) => acknowledgementRequired === true).map(({ code }) => code))].sort();
  const acknowledged = new Set(options.acknowledgedWarningCodes ?? []);
  const requiresWarningAcknowledgement = warningCodes.some((code) => !acknowledged.has(code));
  return { valid: errors.length === 0 && !requiresWarningAcknowledgement, errors, warnings, requiresWarningAcknowledgement, warningCodes, layout, print };
}

export const validatePublicationInput = validatePublication;
