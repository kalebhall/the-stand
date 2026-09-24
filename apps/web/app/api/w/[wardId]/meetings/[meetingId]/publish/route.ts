import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canPublishProgram, canRepublishProgram, canViewProgramDesigner } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isMeetingStatus, transitionMeetingStatus } from '@/src/conducting/model';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { adaptLegacyLayoutToDocument, COMPATIBILITY_PUBLIC_BLOCK_TYPES } from '@/src/document-designer/legacy-layout-adapter';
import { isAdvancedLayout, parseAdvancedLayout, projectAdvancedLayoutForOutput } from '@/src/document-designer/advanced-schema';
import { resolveDocumentData } from '@/src/document-designer/data-resolver';
import { validatePrintLayout } from '@/src/document-designer/overflow';
import { insertImmutableRender, calculatePublicationExpiration } from '@/src/document-designer/publication-service';
import { validatePublication } from '@/src/document-designer/publication-validation';
import { renderDocumentHtml } from '@/src/document-designer/renderer';
import { buildMeetingRenderHtml } from '@/src/meetings/render';
import { getPublicProgramRenderLabels } from '@/src/i18n/public-program';
import { resolveLocale } from '@/src/i18n/config';
import type { IntroductionRoles } from '@/src/meetings/types';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { isWardModuleEnabled } from '@/src/modules/service';

const BAD_REQUEST = (message = 'Invalid publication payload') => NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 });
const NOT_FOUND = () => NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
function token() { return randomBytes(24).toString('base64url'); }

async function recordPublicationValidationFailure(
  client: { query: (text: string, values?: readonly unknown[]) => Promise<unknown> },
  context: { userId: string; wardId: string },
  meeting: { id: string; meetingDate: string },
  validation: { errors: readonly { code?: unknown }[]; warningCodes: readonly string[] },
  sessionUser: { name?: string | null; email?: string | null; roles?: readonly string[] | null }
): Promise<void> {
  try {
    await client.query('BEGIN');
    await setDbContext(client, context);
    await recordAuditEvent(client, {
      wardId: context.wardId,
      userId: context.userId,
      actorName: sessionUser.name || sessionUser.email || null,
      actorRole: sessionUser.roles?.[0] || null,
      action: 'PROGRAM_PUBLISH_VALIDATION_FAILED',
      entityType: 'meeting',
      entityId: meeting.id,
      meetingDate: meeting.meetingDate,
      details: {
        meetingId: meeting.id,
        issueCodes: validation.errors.flatMap(({ code }) => typeof code === 'string' ? [code] : []),
        warningCodes: [...validation.warningCodes]
      },
      source: 'manual_ui',
      severity: 'notice'
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Failed to audit publication validation failure', { meetingId: meeting.id, error });
  }
}

async function readBody(request: Request): Promise<{ acknowledgedWarningCodes: string[] } | null> {
  const text = await request.text();
  if (!text.trim()) return { acknowledgedWarningCodes: [] };
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== 'acknowledgedWarningCodes')) return null;
    const codes = record.acknowledgedWarningCodes;
    if (codes === undefined) return { acknowledgedWarningCodes: [] };
    if (!Array.isArray(codes) || codes.some((code) => typeof code !== 'string' || !code.trim())) return null;
    return { acknowledgedWarningCodes: [...new Set(codes)] };
  } catch { return null; }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const body = await readBody(request);
  if (!body) return BAD_REQUEST();
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meetingResult = await client.query(`SELECT m.id, m.meeting_date, m.meeting_type, m.status, w.name AS ward_name, m.location
      FROM meeting m JOIN ward w ON w.id = m.ward_id WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1 FOR UPDATE`, [meetingId, wardId]);
    if (!meetingResult.rows[0]) { await client.query('ROLLBACK'); return NOT_FOUND(); }
    const meeting = meetingResult.rows[0] as { id: string; meeting_date: string; meeting_type: string; status: string; ward_name: string; location: string | null };
    if (!isMeetingStatus(meeting.status)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting has an invalid status', code: 'INVALID_STATUS' }, { status: 409 });
    }
    if (meeting.status === 'COMPLETED') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Reopen the meeting before publishing again', code: 'INVALID_TRANSITION' }, { status: 409 });
    }
    const profileResult = await client.query(`SELECT allow_program_editor_publish, allow_program_editor_republish, public_program_expiration_days
      FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1`, [wardId]);
    const profile = profileResult.rows[0] ?? {};
    const allowed = meeting.status === 'PUBLISHED'
      ? canRepublishProgram(session.user, wardId, { allowProgramEditorRepublish: profile.allow_program_editor_republish === true })
      : canPublishProgram(session.user, wardId, { allowProgramEditorPublish: profile.allow_program_editor_publish === true });
    if (!allowed) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }); }

    const shareResult = await client.query(`SELECT token FROM public_program_share WHERE ward_id = $1::uuid AND meeting_id = $2::uuid LIMIT 1 FOR UPDATE`, [wardId, meetingId]);
    const shareToken = (shareResult.rows[0] as { token?: string } | undefined)?.token ?? token();
    const versionResult = await client.query(`SELECT COALESCE(MAX(version), 0)::int + 1 AS next_version FROM meeting_program_render WHERE ward_id = $1::uuid AND meeting_id = $2::uuid`, [wardId, meetingId]);
    const nextVersion = (versionResult.rows[0] as { next_version?: number | string } | undefined)?.next_version;
    const version = Number(nextVersion);
    if (!Number.isSafeInteger(version) || version < 1) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Failed to determine publication version', code: 'INTERNAL_ERROR' }, { status: 500 });
    }

    const itemsResult = await client.query(`SELECT item_type, title, notes, topic, program_notes, hymn_number, hymn_title, introduction_roles
      FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid ORDER BY sequence ASC`, [meetingId, wardId]);
    const announcements = await client.query(`SELECT title, body, start_date, end_date, is_permanent, placement, include_in_program
      FROM announcement WHERE ward_id = $1::uuid AND include_in_program = TRUE AND (is_permanent = TRUE OR ((start_date IS NULL OR start_date <= $2::date) AND (end_date IS NULL OR end_date >= $2::date))) ORDER BY created_at DESC`, [wardId, meeting.meeting_date]);
    const mediaResult = await client.query(`SELECT id, public_token, alt_text, is_decorative FROM media_asset WHERE status = 'ACTIVE'
      AND (scope_type = 'SYSTEM'
        OR (scope_type = 'WARD' AND ward_id = $1::uuid)
        OR (scope_type = 'STAKE' AND stake_id = (SELECT stake_id FROM ward WHERE id = $1::uuid)))`, [wardId]);
    const media = Object.fromEntries((mediaResult.rows as Array<{ id: string; public_token: string | null; alt_text: string | null; is_decorative: boolean }>).filter((item) => item.public_token).map((item) => [item.id, { url: `/media/${item.public_token}`, altText: item.alt_text, isDecorative: item.is_decorative }]));
    const programItems = (itemsResult.rows as Array<{ item_type: string; title: string | null; notes: string | null; topic: string | null; program_notes: string | null; hymn_number: string | null; hymn_title: string | null; introduction_roles: IntroductionRoles | null }>).map((item, order) => ({ itemType: item.item_type, title: item.title, notes: item.notes, topic: item.topic, programNotes: item.program_notes, hymnNumber: item.hymn_number, hymnTitle: item.hymn_title, introductionRoles: item.introduction_roles, order }));
    const localeResult = await client.query('SELECT preferred_locale FROM user_account WHERE id = $1::uuid AND is_active = true LIMIT 1', [session.user.id]);
    const locale = resolveLocale(localeResult.rows[0]?.preferred_locale);
    const documentResult = await client.query(`SELECT layout_json, source_template_id, source_template_version FROM meeting_document WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND document_type = 'SACRAMENT_PROGRAM' LIMIT 1`, [meetingId, wardId]);
    const legacyResult = await client.query(`SELECT preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1`, [wardId]);
    const legacy = legacyResult.rows[0] ?? { preset: 'FULL_PAGE', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE', cover_image_url: null, cover_image_alt_text: null };
    const rawLayout = documentResult.rows[0]?.layout_json ?? adaptLegacyLayoutToDocument(legacy);
    const sourceData = { meetingDate: String(meeting.meeting_date), meetingType: meeting.meeting_type, wardName: meeting.ward_name, location: meeting.location, publicUrl: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/p/${shareToken}`, programItems: programItems.map((item) => ({ order: item.order, label: item.title ?? item.hymnTitle ?? item.itemType, details: item.topic ?? null })), publicValues: { ANNOUNCEMENTS: (announcements.rows as Array<{ title: string }>).map((item) => item.title).join(' · ') }, media };
    const advancedDesignerEnabled = isAdvancedDesignerFeatureEnabled();
    const resolved = resolveDocumentData(rawLayout, sourceData, { public: true, explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES, advancedProjection: advancedDesignerEnabled });
    const publishedLayout = advancedDesignerEnabled && isAdvancedLayout(rawLayout)
      ? projectAdvancedLayoutForOutput(parseAdvancedLayout(rawLayout), 'PUBLIC', resolved.data)
      : resolved.layout;
    const validation = validatePublication({ layout: resolved.layout, data: resolved.data }, { explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES, acknowledgedWarningCodes: body.acknowledgedWarningCodes });
    if (!validation.valid) {
      await client.query('ROLLBACK');
      await recordPublicationValidationFailure(client, { userId: session.user.id, wardId }, { id: meeting.id, meetingDate: meeting.meeting_date }, validation, session.user);
      return NextResponse.json({ error: validation.errors.length ? 'Publication validation failed' : 'Publication warnings require acknowledgement', code: validation.errors.length ? 'PUBLICATION_VALIDATION_FAILED' : 'WARNING_ACKNOWLEDGEMENT_REQUIRED', errors: validation.errors, warnings: validation.warnings, warningCodes: validation.warningCodes }, { status: 422 });
    }
    const rendered = documentResult.rows[0]?.layout_json ? renderDocumentHtml({ layout: publishedLayout, data: resolved.data, public: true, explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES }).html : buildMeetingRenderHtml({ publicUrl: sourceData.publicUrl, meetingDate: sourceData.meetingDate, meetingType: meeting.meeting_type, programItems, announcements: announcements.rows, layout: { preset: legacy.preset, announcementMode: legacy.announcement_mode, coverMode: legacy.cover_mode, coverImageUrl: legacy.cover_image_url, coverImageAltText: legacy.cover_image_alt_text }, labels: getPublicProgramRenderLabels(locale, meeting.meeting_type) });
    const publishedAt = new Date();
    const printValidation = validatePrintLayout(publishedLayout, resolved.data);
    const inserted = await insertImmutableRender(client, { wardId, meetingId, version, renderHtml: rendered, layoutJson: publishedLayout, renderDataJson: resolved.data, documentType: publishedLayout.documentType, sourceTemplateId: documentResult.rows[0]?.source_template_id ?? null, sourceTemplateVersion: documentResult.rows[0]?.source_template_version == null ? null : Number(documentResult.rows[0].source_template_version), publishedByUserId: session.user.id, publishedAt, publicationMetadataJson: { validationWarningCodes: validation.warningCodes, rendererVersion: 'm8', pageCount: printValidation.pageCount, layoutHash: createHash('sha256').update(JSON.stringify(publishedLayout)).digest('hex') } });
    if (!inserted.id || !Number.isSafeInteger(inserted.version) || inserted.version < 1 || inserted.version !== version) {
      throw new Error('Publication render insert returned an invalid version');
    }
    const expiresAt = calculatePublicationExpiration(publishedAt, profile.public_program_expiration_days == null ? null : Number(profile.public_program_expiration_days));
    await client.query(`INSERT INTO public_program_share (ward_id, meeting_id, token, active_render_id, expires_at) VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, $5::timestamptz)
      ON CONFLICT (meeting_id) DO UPDATE SET active_render_id = EXCLUDED.active_render_id, expires_at = EXCLUDED.expires_at, updated_at = now()`, [wardId, meetingId, shareToken, inserted.id, expiresAt]);
    if (meeting.status === 'DRAFT') transitionMeetingStatus(meeting.status, 'publish');
    await client.query(`UPDATE meeting SET status = 'PUBLISHED', updated_at = now() WHERE id = $1::uuid AND ward_id = $2::uuid`, [meetingId, wardId]);
    await client.query(`INSERT INTO public_program_portal (ward_id, token) VALUES ($1::uuid, $2::text) ON CONFLICT (ward_id) DO NOTHING`, [wardId, token()]);
    const auditAction = version > 1 ? 'PROGRAM_REPUBLISHED' : 'PROGRAM_PUBLISHED';
    const notificationEventType = version > 1 ? 'MEETING_REPUBLISHED' : 'MEETING_PUBLISHED';
    await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name || session.user.email || null, actorRole: session.user.roles?.[0] || null, action: auditAction, entityType: 'meeting', entityId: meetingId, meetingDate: meeting.meeting_date, changes: { status: { old: meeting.status, new: 'PUBLISHED' }, version: { old: version - 1, new: version } }, previousState: { status: meeting.status, version: version - 1 }, details: { meetingId, version }, source: 'manual_ui', severity: 'notice' });
    const outbox = await client.query(`INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload) VALUES ($1::uuid, 'meeting', $2::uuid, $3::text, $4::jsonb) ON CONFLICT (ward_id, event_type, aggregate_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending' RETURNING id`, [wardId, meetingId, notificationEventType, JSON.stringify({ meetingId, version })]);
    await client.query('COMMIT');
    Promise.resolve(enqueueOutboxNotificationJob({ wardId, eventOutboxId: outbox.rows[0].id as string })).catch(() => undefined);
    return NextResponse.json({ success: true, meetingId, version, status: 'PUBLISHED' });
  } catch (error) {
    console.error('Failed to publish meeting', { error, meetingId });
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to publish meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}
