import type { Queryable } from './persistence';
import type { ResolvedDocumentData } from './render-types';
import type { DocumentLayout } from './types';
import type { AdvancedDocumentLayout } from './advanced-schema';

export type PublicationMetadata = {
  readonly validationWarningCodes: readonly string[];
  readonly rendererVersion: string;
  readonly pageCount: number;
  readonly layoutHash: string;
};

export type ImmutableRenderInsertPayload = {
  readonly wardId: string;
  readonly meetingId: string;
  readonly version: number;
  readonly renderHtml: string;
  readonly layoutJson: DocumentLayout | AdvancedDocumentLayout;
  readonly renderDataJson: ResolvedDocumentData;
  readonly documentType: DocumentLayout['documentType'];
  readonly sourceTemplateId: string | null;
  readonly sourceTemplateVersion: number | null;
  readonly publishedByUserId: string;
  readonly publishedAt: Date;
  readonly publicationMetadataJson: PublicationMetadata;
};

export class PublicationServiceError extends Error {
  constructor(public readonly code: 'MEETING_NOT_FOUND' | 'RENDER_INSERT_FAILED' | 'ACTIVE_POINTER_FAILED', message: string) {
    super(message);
    this.name = 'PublicationServiceError';
  }
}

export function calculatePublicationExpiration(publishedAt: Date, expirationDays: number | null | undefined): Date | null {
  if (expirationDays === null || expirationDays === undefined) return null;
  if (!Number.isInteger(expirationDays) || expirationDays < 0) throw new RangeError('Expiration days must be a non-negative integer.');
  const expiresAt = new Date(publishedAt.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + expirationDays);
  return expiresAt;
}

export function safePublicationMetadata(input: { validationWarningCodes?: readonly string[]; rendererVersion: string; pageCount: number; layoutHash: string }): PublicationMetadata {
  return {
    validationWarningCodes: [...new Set(input.validationWarningCodes ?? [])].sort(),
    rendererVersion: input.rendererVersion,
    pageCount: input.pageCount,
    layoutHash: input.layoutHash
  };
}

export function buildImmutableRenderInsertPayload(input: Omit<ImmutableRenderInsertPayload, 'publicationMetadataJson'> & { publicationMetadata: Parameters<typeof safePublicationMetadata>[0] }): ImmutableRenderInsertPayload {
  return {
    wardId: input.wardId,
    meetingId: input.meetingId,
    version: input.version,
    renderHtml: input.renderHtml,
    layoutJson: structuredClone(input.layoutJson),
    renderDataJson: structuredClone(input.renderDataJson),
    documentType: input.documentType,
    sourceTemplateId: input.sourceTemplateId,
    sourceTemplateVersion: input.sourceTemplateVersion,
    publishedByUserId: input.publishedByUserId,
    publishedAt: new Date(input.publishedAt.getTime()),
    publicationMetadataJson: safePublicationMetadata(input.publicationMetadata)
  };
}

export async function nextPublicationVersion(client: Queryable, input: { wardId: string; meetingId: string }): Promise<number> {
  const meeting = await client.query(`SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid FOR UPDATE`, [input.meetingId, input.wardId]);
  if (!meeting.rows[0]) throw new PublicationServiceError('MEETING_NOT_FOUND', 'Meeting was not found for this ward.');
  const result = await client.query(`SELECT COALESCE(MAX(version), 0)::int + 1 AS next_version
    FROM meeting_program_render WHERE ward_id = $1::uuid AND meeting_id = $2::uuid`, [input.wardId, input.meetingId]);
  const value = Number((result.rows[0] as { next_version?: number | string } | undefined)?.next_version);
  if (!Number.isInteger(value) || value < 1) throw new PublicationServiceError('RENDER_INSERT_FAILED', 'Could not determine the next publication version.');
  return value;
}

export async function insertImmutableRender(client: Queryable, payload: ImmutableRenderInsertPayload): Promise<{ id: string; version: number }> {
  const result = await client.query(`INSERT INTO meeting_program_render (
      ward_id, meeting_id, version, render_html, layout_json, render_data_json, document_type,
      source_template_id, source_template_version, published_by_user_id, published_at, publication_metadata_json
    ) VALUES ($1::uuid, $2::uuid, $3::int, $4::text, $5::jsonb, $6::jsonb, $7::text,
      $8::uuid, $9::int, $10::uuid, $11::timestamptz, $12::jsonb)
    RETURNING id, version`, [
    payload.wardId, payload.meetingId, payload.version, payload.renderHtml, JSON.stringify(payload.layoutJson), JSON.stringify(payload.renderDataJson), payload.documentType,
    payload.sourceTemplateId, payload.sourceTemplateVersion, payload.publishedByUserId, payload.publishedAt, JSON.stringify(payload.publicationMetadataJson)
  ]);
  const row = result.rows[0] as { id: string; version: number } | undefined;
  if (!row) throw new PublicationServiceError('RENDER_INSERT_FAILED', 'Publication render insert returned no row.');
  return row;
}

export async function updateActivePublicPointer(client: Queryable, input: { wardId: string; meetingId: string; renderId: string; expiresAt: Date | null }): Promise<void> {
  const result = await client.query(`UPDATE public_program_share
    SET active_render_id = $1::uuid, expires_at = $2::timestamptz, updated_at = now()
    WHERE ward_id = $3::uuid AND meeting_id = $4::uuid
    RETURNING meeting_id`, [input.renderId, input.expiresAt, input.wardId, input.meetingId]);
  if (!result.rows[0]) throw new PublicationServiceError('ACTIVE_POINTER_FAILED', 'Public program share was not found for this ward and meeting.');
}

export type DraftPublicationInput = { readonly layout: DocumentLayout; readonly data: ResolvedDocumentData };
export type PublishedPublicationInput = { readonly layoutJson: DocumentLayout | AdvancedDocumentLayout; readonly renderDataJson: ResolvedDocumentData; readonly renderHtml: string };
export function resolveDraftPublicationInput(input: DraftPublicationInput): DraftPublicationInput { return { layout: structuredClone(input.layout), data: structuredClone(input.data) }; }
export function resolvePublishedPublicationInput(input: PublishedPublicationInput): PublishedPublicationInput { return { layoutJson: structuredClone(input.layoutJson), renderDataJson: structuredClone(input.renderDataJson), renderHtml: input.renderHtml }; }
