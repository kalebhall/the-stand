import type { DocumentLayout } from './types';

export type PrintPreviewMode = 'FRONT' | 'BACK' | 'FOLDED';
export type PrintSource = 'DRAFT' | 'PUBLISHED';
export type PrintIssueSeverity = 'ERROR' | 'WARNING';

export type PrintIssue = {
  code: string;
  blockId?: string;
  path?: string;
  message: string;
  severity: PrintIssueSeverity;
  suggestion?: string;
};

export type PrintRenderMetadata = {
  schemaVersion: number;
  layoutHash: string;
  documentType: DocumentLayout['documentType'];
  paper: DocumentLayout['paper'];
  orientation: DocumentLayout['orientation'];
  fold: DocumentLayout['fold'];
  pageCount: number;
  rendererVersion: string;
  mediaAssetIds: string[];
};

export type PrintValidationResult = {
  valid: boolean;
  errors: PrintIssue[];
  warnings: PrintIssue[];
  pageCount: number;
  foldGuidance: string[];
  metadata: PrintRenderMetadata;
};

export type PrintDocumentRequest = {
  layout: unknown;
  data: unknown;
  mode?: PrintPreviewMode;
};

export const PDF_RENDERER_VERSION = 'm7.1';
