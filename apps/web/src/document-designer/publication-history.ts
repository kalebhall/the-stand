import type { Queryable } from './persistence';

export type PublicationHistoryItem = {
  id: string;
  wardId: string;
  meetingId: string;
  version: number;
  documentType: string;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  publishedByUserId: string | null;
  publishedAt: string | null;
  createdAt: string;
  active: boolean;
  expiresAt: string | null;
  expired: boolean;
  activeButExpired: boolean;
};

export type ActivePublication = PublicationHistoryItem & { active: true };

export class PublicationHistoryError extends Error {
  constructor(public readonly code: 'HISTORY_NOT_FOUND' | 'ROLLBACK_TARGET_INVALID' | 'ROLLBACK_INPUTS_INCOMPLETE' | 'ACTIVE_POINTER_NOT_FOUND', message: string) {
    super(message);
    this.name = 'PublicationHistoryError';
  }
}

type HistoryRow = {
  id: string; ward_id: string; meeting_id: string; version: number; document_type: string;
  source_template_id: string | null; source_template_version: number | null;
  published_by_user_id: string | null; published_at: string | null; created_at: string;
  active: boolean; expires_at: string | null; expired: boolean; active_but_expired: boolean;
};

function toDto(row: HistoryRow): PublicationHistoryItem {
  return { id: row.id, wardId: row.ward_id, meetingId: row.meeting_id, version: row.version, documentType: row.document_type, sourceTemplateId: row.source_template_id, sourceTemplateVersion: row.source_template_version, publishedByUserId: row.published_by_user_id, publishedAt: row.published_at, createdAt: row.created_at, active: row.active, expiresAt: row.expires_at, expired: row.expired, activeButExpired: row.active_but_expired };
}

const HISTORY_COLUMNS = `r.id, r.ward_id, r.meeting_id, r.version, r.document_type,
  r.source_template_id, r.source_template_version, r.published_by_user_id, r.published_at, r.created_at,
  (s.active_render_id = r.id) AS active,
  s.expires_at,
  (s.expires_at IS NOT NULL AND s.expires_at <= now()) AS expired,
  (s.active_render_id = r.id AND s.expires_at IS NOT NULL AND s.expires_at <= now()) AS active_but_expired`;

export async function listPublicationHistory(client: Queryable, input: { wardId: string; meetingId: string }): Promise<PublicationHistoryItem[]> {
  const result = await client.query(`SELECT ${HISTORY_COLUMNS}
    FROM meeting_program_render r
    LEFT JOIN public_program_share s ON s.ward_id = r.ward_id AND s.meeting_id = r.meeting_id
    WHERE r.ward_id = $1::uuid AND r.meeting_id = $2::uuid AND r.published_at IS NOT NULL
    ORDER BY r.version DESC, r.created_at DESC, r.id DESC`, [input.wardId, input.meetingId]);
  return (result.rows as unknown as HistoryRow[]).map(toDto);
}

export async function getActivePublication(client: Queryable, input: { wardId: string; meetingId: string }): Promise<ActivePublication | null> {
  const result = await client.query(`SELECT ${HISTORY_COLUMNS}
    FROM public_program_share s
    JOIN meeting_program_render r ON r.id = s.active_render_id
      AND r.ward_id = s.ward_id AND r.meeting_id = s.meeting_id
    WHERE s.ward_id = $1::uuid AND s.meeting_id = $2::uuid
      AND s.active_render_id IS NOT NULL
    LIMIT 1`, [input.wardId, input.meetingId]);
  const row = result.rows[0] as unknown as HistoryRow | undefined;
  return row ? { ...toDto(row), active: true } : null;
}

export function validateRollbackTarget(target: PublicationHistoryItem | null | undefined, input: { wardId: string; meetingId: string }): PublicationHistoryItem {
  if (!target || target.wardId !== input.wardId || target.meetingId !== input.meetingId) throw new PublicationHistoryError('ROLLBACK_TARGET_INVALID', 'Rollback target does not belong to this ward and meeting.');
  if (!target.id || !Number.isInteger(target.version) || target.version < 1 || !target.documentType || !target.publishedAt) throw new PublicationHistoryError('ROLLBACK_INPUTS_INCOMPLETE', 'Rollback target is missing immutable publication inputs.');
  return target;
}

export async function selectActivePublication(client: Queryable, input: { wardId: string; meetingId: string; renderId: string }): Promise<void> {
  const target = await client.query(`SELECT id, ward_id, meeting_id, layout_json, render_data_json, published_at
    FROM meeting_program_render
    WHERE id = $1::uuid AND ward_id = $2::uuid AND meeting_id = $3::uuid
    LIMIT 1`, [input.renderId, input.wardId, input.meetingId]);
  const row = target.rows[0] as { id: string; layout_json: unknown; render_data_json: unknown; published_at: string | null } | undefined;
  if (!row) throw new PublicationHistoryError('HISTORY_NOT_FOUND', 'Publication render was not found for this ward and meeting.');
  if (row.published_at === null || row.layout_json === null || row.render_data_json === null) throw new PublicationHistoryError('ROLLBACK_INPUTS_INCOMPLETE', 'Publication render does not contain complete immutable inputs.');
  const result = await client.query(`UPDATE public_program_share
    SET active_render_id = $1::uuid, updated_at = now()
    WHERE ward_id = $2::uuid AND meeting_id = $3::uuid
    RETURNING meeting_id`, [input.renderId, input.wardId, input.meetingId]);
  if (!result.rows[0]) throw new PublicationHistoryError('ACTIVE_POINTER_NOT_FOUND', 'Public program share was not found for this ward and meeting.');
}

export const listPublicationVersions = listPublicationHistory;
export const resolveActivePublication = getActivePublication;
export const selectActiveVersion = selectActivePublication;
