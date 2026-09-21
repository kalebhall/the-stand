import { NextResponse } from 'next/server';
import { auth } from '@/src/auth/auth';
import { canRollbackProgram, canViewProgramDesigner } from '@/src/auth/roles';
import { recordAuditEvent } from '@/src/audit/service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { calculatePublicationExpiration } from '@/src/document-designer/publication-service';

const response = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });
async function readVersion(request: Request): Promise<number | null> {
  const text = await request.text();
  if (!text.trim()) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 1 || !Object.prototype.hasOwnProperty.call(record, 'version')) return null;
    return Number.isInteger(record.version) && Number(record.version) > 0 ? Number(record.version) : null;
  } catch { return null; }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const version = await readVersion(request);
  if (version === null) return response('Invalid rollback payload', 'BAD_REQUEST', 400);
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return response('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return response('Forbidden', 'FORBIDDEN', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meeting = await client.query('SELECT id, meeting_date FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1 FOR UPDATE', [meetingId, wardId]);
    if (!meeting.rows[0]) { await client.query('ROLLBACK'); return response('Meeting not found', 'NOT_FOUND', 404); }
    const settings = await client.query('SELECT allow_program_editor_rollback, public_program_expiration_days FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1', [wardId]);
    const profile = settings.rows[0] ?? {};
    if (!canRollbackProgram(session.user, wardId, { allowProgramEditorRollback: profile.allow_program_editor_rollback === true })) { await client.query('ROLLBACK'); return response('Forbidden', 'FORBIDDEN', 403); }
    const share = await client.query(`SELECT s.token, s.active_render_id, previous.version AS previous_version
      FROM public_program_share s LEFT JOIN meeting_program_render previous ON previous.id = s.active_render_id AND previous.ward_id = s.ward_id AND previous.meeting_id = s.meeting_id
      WHERE s.ward_id = $1::uuid AND s.meeting_id = $2::uuid LIMIT 1 FOR UPDATE OF s`, [wardId, meetingId]);
    if (!share.rows[0]) { await client.query('ROLLBACK'); return response('Public program share not found', 'NOT_FOUND', 404); }
    const target = await client.query(`SELECT id, version, document_type, published_at, layout_json, render_data_json
      FROM meeting_program_render WHERE ward_id = $1::uuid AND meeting_id = $2::uuid AND version = $3::int`, [wardId, meetingId, version]);
    const row = target.rows[0] as { id: string; version: number; document_type: string; published_at: string | null; layout_json: unknown; render_data_json: unknown } | undefined;
    if (!row) { await client.query('ROLLBACK'); return response('Publication version not found', 'NOT_FOUND', 404); }
    if (!row.published_at || !row.layout_json || !row.render_data_json || row.document_type !== 'SACRAMENT_PROGRAM') { await client.query('ROLLBACK'); return response('Publication version is not rollbackable', 'ROLLBACK_INPUTS_UNAVAILABLE', 409); }
    const previous = share.rows[0].active_render_id as string | null;
    const expiresAt = calculatePublicationExpiration(new Date(row.published_at), profile.public_program_expiration_days == null ? null : Number(profile.public_program_expiration_days));
    await client.query(`UPDATE public_program_share SET active_render_id = $1::uuid, expires_at = $2::timestamptz, updated_at = now()
      WHERE ward_id = $3::uuid AND meeting_id = $4::uuid`, [row.id, expiresAt, wardId, meetingId]);
    await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name || session.user.email || null, action: 'PROGRAM_ROLLBACK', entityType: 'meeting', entityId: meetingId, meetingDate: meeting.rows[0].meeting_date, changes: { activeRenderId: { old: previous, new: row.id }, version: { old: share.rows[0].previous_version == null ? null : Number(share.rows[0].previous_version), new: row.version } }, details: { meetingId, version: row.version }, source: 'manual_ui', severity: 'notice' });
    await client.query('COMMIT');
    return NextResponse.json({ activeVersion: row.version, previousActiveVersion: share.rows[0].previous_version == null ? null : Number(share.rows[0].previous_version) });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return response('Failed to roll back publication', 'INTERNAL_ERROR', 500);
  } finally { client.release(); }
}
