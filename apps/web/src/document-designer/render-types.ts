import type { DocumentBlock, DocumentLayout } from './types';
import type { AdvancedDocumentLayout } from './advanced-schema';
import type { MeetingRenderLabels } from '../meetings/render';

export type RenderTarget = 'DIGITAL' | 'PRINT';

export type ResolvedDocumentData = {
  meetingDate: string;
  meetingType: string;
  wardName?: string | null;
  location?: string | null;
  publicUrl?: string | null;
  renderLabels?: MeetingRenderLabels;
  values: Partial<Record<DocumentBlock['type'], string | null>>;
  blockValues?: Record<string, string>;
  meetingItems: Array<{ label: string; details?: string | null; order: number }>;
  warnings: string[];
  media?: Partial<Record<string, { url: string; altText: string | null; isDecorative: boolean }>>;
};

export type DocumentRenderInput = {
  layout: DocumentLayout | AdvancedDocumentLayout;
  data: ResolvedDocumentData;
  target?: RenderTarget;
  public?: boolean;
  explicitPublicBlockTypes?: readonly string[];
};

export type DocumentRenderOutput = {
  html: string;
  warnings: string[];
  metadata: {
    target: RenderTarget;
    documentType: DocumentLayout['documentType'];
    schemaVersion: DocumentLayout['schemaVersion'];
    blockCount: number;
  };
};
