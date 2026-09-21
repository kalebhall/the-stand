import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canEditProgramDesign, canUseAdvancedProgramDesigner, canViewProgramDesigner } from '@/src/auth/roles';
import { BUILT_IN_TEMPLATES } from '@/src/document-designer/built-in-templates';
import { buildPublicPreviewSource, getSimpleModeProperties, SimpleModeValidationError, validateSimpleModeDraft } from '@/src/document-designer/meeting-document-service';
import { parseTemplateLayout } from '@/src/document-designer/template-service';
import { allBlocks, validatePublicDocumentLayout } from '@/src/document-designer/public-safety';
import { getRegisteredBlockDefinition } from '@/src/document-designer/registry';
import { mergeSimpleIntoAdvanced, normalizeToAdvanced, downgradeToV1, parseAdvancedLayout, projectAdvancedLayoutForPublic, type AdvancedDocumentLayout } from '@/src/document-designer/advanced-schema';
import { assertNoLockedChanges, LockedLayoutError } from '@/src/document-designer/lock-enforcement';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import type { DocumentLayout } from '@/src/document-designer/types';

const saveSchema = z.object({ expectedRevision: z.number().int().positive(), document: z.unknown(), templateId: z.string().trim().min(1).optional(), mode: z.enum(['SIMPLE', 'ADVANCED']).default('SIMPLE') }).strict();
const fullPageFallback = () => BUILT_IN_TEMPLATES.find((template) => template.key === 'full-page-standard')!.layout;

function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

async function readContext(client: Awaited<ReturnType<typeof pool.connect>>, wardId: string, meetingId: string) {
  const meetingResult = await client.query(
    `SELECT m.id, m.meeting_date, m.meeting_type, w.name AS ward_name
       FROM meeting m JOIN ward w ON w.id = m.ward_id
      WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1`,
    [meetingId, wardId]
  );
  if (!meetingResult.rows[0]) return null;
  const documentResult = await client.query(
    `SELECT md.id, md.source_template_id, md.source_template_version, md.schema_version, md.layout_json, md.theme_json, md.revision,
            t.name AS source_template_name
       FROM meeting_document md
       LEFT JOIN document_template t ON t.id = md.source_template_id
      WHERE md.meeting_id = $1::uuid AND md.ward_id = $2::uuid AND md.document_type = 'SACRAMENT_PROGRAM'
      LIMIT 1`,
    [meetingId, wardId]
  );
  const itemsResult = await client.query(
    `SELECT item_type, title, topic, hymn_title, sequence
       FROM meeting_program_item
      WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
      ORDER BY sequence ASC`,
    [meetingId, wardId]
  );
  const settingsResult = await client.query(
    'SELECT allow_advanced_program_designer FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1',
    [wardId]
  );
  const meeting = meetingResult.rows[0] as { id: string; meeting_date: string; meeting_type: string; ward_name: string | null };
  const row = documentResult.rows[0] as Record<string, unknown> | undefined;
  const layout = row?.layout_json ?? fullPageFallback();
  const revision = Number(row?.revision ?? 1);
  const profile = { allowAdvancedProgramDesigner: (settingsResult.rows[0] as { allow_advanced_program_designer?: boolean } | undefined)?.allow_advanced_program_designer === true };
  const items = itemsResult.rows as Array<{ item_type: string; title: string | null; topic: string | null; hymn_title: string | null; sequence: number }>;
  const previewSource = buildPublicPreviewSource({ meetingDate: meeting.meeting_date, meetingType: meeting.meeting_type, wardName: meeting.ward_name }, items.map((item) => ({ itemType: item.item_type, title: item.title, topic: item.topic, hymnTitle: item.hymn_title, sequence: item.sequence })));
  return { meeting, row, layout, revision, profile, items, previewSource };
}

async function ensureDocument(client: Awaited<ReturnType<typeof pool.connect>>, wardId: string, meetingId: string, userId: string) {
  const existing = await client.query(
    `SELECT id, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision
       FROM meeting_document
      WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND document_type = 'SACRAMENT_PROGRAM'
      LIMIT 1 FOR UPDATE`,
    [meetingId, wardId]
  );
  if (existing.rows[0]) return existing.rows[0] as Record<string, unknown>;
  const layout = fullPageFallback();
  const inserted = await client.query(
    `INSERT INTO meeting_document (ward_id, meeting_id, document_type, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision, updated_by_user_id)
     VALUES ($1::uuid, $2::uuid, 'SACRAMENT_PROGRAM', NULL, NULL, $3::int, $4::jsonb, $5::jsonb, 1, $6::uuid)
     RETURNING id, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision`,
    [wardId, meetingId, layout.schemaVersion, JSON.stringify(layout), JSON.stringify(layout.theme), userId]
  );
  return inserted.rows[0] as Record<string, unknown>;
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const contextData = await readContext(client, wardId, meetingId);
    if (!contextData) { await client.query('ROLLBACK'); return errorResponse('Meeting not found', 'NOT_FOUND', 404); }
    const document = await ensureDocument(client, wardId, meetingId, session.user.id);
    const advancedModeAvailable = canUseAdvancedProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, contextData.profile);
    const advancedLayout = parseAdvancedLayout(document.layout_json);
    const layout = downgradeToV1(advancedLayout);
    await client.query('COMMIT');
    return NextResponse.json({
      meeting: { id: contextData.meeting.id, meetingDate: contextData.meeting.meeting_date, meetingType: contextData.meeting.meeting_type },
      document: { id: document.id, layout, ...(advancedModeAvailable ? { advancedLayout } : {}), theme: document.theme_json ?? layout.theme, revision: Number(document.revision ?? 1), sourceTemplateId: document.source_template_id ?? null, sourceTemplateVersion: document.source_template_version ?? null, schemaVersion: advancedModeAvailable ? advancedLayout.schemaVersion : layout.schemaVersion },
      simpleMode: getSimpleModeProperties(layout, canUseAdvancedProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, contextData.profile)),
      previewSource: contextData.previewSource
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to load program design', 'INTERNAL_ERROR', 500);
  } finally { client.release(); }
}

export async function PUT(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canEditProgramDesign({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const body = saveSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse('Invalid program design payload', 'BAD_REQUEST', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meeting = await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [meetingId, wardId]);
    if (!meeting.rows[0]) { await client.query('ROLLBACK'); return errorResponse('Meeting not found', 'NOT_FOUND', 404); }
    const current = await ensureDocument(client, wardId, meetingId, session.user.id);
    const settingsResult = await client.query('SELECT allow_advanced_program_designer FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1', [wardId]);
    const advancedModeAvailable = canUseAdvancedProgramDesigner(
      { roles: session.user.roles, activeWardId: session.activeWardId },
      wardId,
      { allowAdvancedProgramDesigner: (settingsResult.rows[0] as { allow_advanced_program_designer?: boolean } | undefined)?.allow_advanced_program_designer === true }
    );
    const revision = Number(current.revision);
    if (body.data.expectedRevision !== revision) { await client.query('ROLLBACK'); return errorResponse('The program changed in another session', 'REVISION_CONFLICT', 409); }
    let validated: { layout: DocumentLayout; warnings: string[] };
    let sourceTemplateId: string | null = (current.source_template_id as string | null | undefined) ?? null;
    let sourceTemplateVersion: number | null = current.source_template_version == null ? null : Number(current.source_template_version);
    try {
      if (body.data.mode === 'ADVANCED') {
        const advanced = parseAdvancedLayout(body.data.document);
        validated = { layout: downgradeToV1(advanced), warnings: [] };
      } else if (body.data.templateId) {
        const builtIn = BUILT_IN_TEMPLATES.find((template) => template.key === body.data.templateId);
        if (builtIn) {
          validated = { layout: parseTemplateLayout(builtIn.layout), warnings: [] };
          if (!advancedModeAvailable && allBlocks(validated.layout).some((block) => getRegisteredBlockDefinition(validated.layout.documentType, block.type).exposure === 'ADVANCED')) {
            throw new SimpleModeValidationError('ADVANCED_BLOCK', 'This template requires Advanced Mode');
          }
          sourceTemplateId = null;
          sourceTemplateVersion = 1;
        } else {
          const templateResult = await client.query(
            `SELECT t.id, v.version, v.layout_json
               FROM document_template t
               JOIN document_template_version v ON v.id = t.current_published_version_id
              WHERE t.id = $1::uuid AND t.document_type = 'SACRAMENT_PROGRAM'
                AND t.status <> 'ARCHIVED'
                AND ((t.scope_type = 'STAKE' AND t.status = 'PUBLISHED' AND t.scope_id = (SELECT stake_id FROM ward WHERE id = $2::uuid))
                  OR (t.scope_type = 'WARD' AND t.scope_id = $2::uuid)
                  OR (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = $2::uuid AND t.created_by_user_id = $3::uuid))
              LIMIT 1`,
            [body.data.templateId, wardId, session.user.id]
          );
          if (!templateResult.rows[0]) { await client.query('ROLLBACK'); return errorResponse('Template not found', 'TEMPLATE_NOT_FOUND', 404); }
          const templateRow = templateResult.rows[0] as { id: string; version: number; layout_json: unknown };
          validated = { layout: parseTemplateLayout(templateRow.layout_json), warnings: [] };
          if (!advancedModeAvailable && allBlocks(validated.layout).some((block) => getRegisteredBlockDefinition(validated.layout.documentType, block.type).exposure === 'ADVANCED')) {
            throw new SimpleModeValidationError('ADVANCED_BLOCK', 'This template requires Advanced Mode');
          }
          sourceTemplateId = templateRow.id;
          sourceTemplateVersion = Number(templateRow.version);
        }
      } else {
        validated = validateSimpleModeDraft(body.data.document, current.layout_json && typeof current.layout_json === 'object' && (current.layout_json as { schemaVersion?: unknown }).schemaVersion === 2 ? downgradeToV1(parseAdvancedLayout(current.layout_json)) : current.layout_json);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof SimpleModeValidationError) return errorResponse(error.message, error.code, error.code === 'INVALID_LAYOUT' ? 400 : 422);
      return errorResponse('Invalid program design', 'BAD_REQUEST', 400);
    }
    if (body.data.mode === 'ADVANCED' && !advancedModeAvailable) {
      await client.query('ROLLBACK');
      return errorResponse('Advanced Mode is not enabled for this ward', 'FORBIDDEN', 403);
    }
    let advancedToSave: AdvancedDocumentLayout | null = null;
    if (body.data.mode === 'ADVANCED') {
      try {
        advancedToSave = parseAdvancedLayout(body.data.document);
        assertNoLockedChanges(normalizeToAdvanced(current.layout_json), advancedToSave);
      } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof LockedLayoutError) return errorResponse(error.message, 'LOCKED_LAYOUT', 409);
        return errorResponse(error instanceof Error ? error.message : 'Invalid advanced layout', 'BAD_REQUEST', 400);
      }
    }
    const persistedLayout = advancedToSave ?? (current.layout_json && typeof current.layout_json === 'object' && (current.layout_json as { schemaVersion?: unknown }).schemaVersion === 2 ? mergeSimpleIntoAdvanced(parseAdvancedLayout(current.layout_json), validated.layout) : validated.layout);
    try {
      const previousAdvanced = current.layout_json && typeof current.layout_json === 'object' && (current.layout_json as { schemaVersion?: unknown }).schemaVersion === 2
        ? parseAdvancedLayout(current.layout_json)
        : normalizeToAdvanced(current.layout_json);
      assertNoLockedChanges(previousAdvanced, parseAdvancedLayout(persistedLayout));
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof LockedLayoutError) return errorResponse(error.message, 'LOCKED_LAYOUT', 409);
      return errorResponse('Invalid program design', 'BAD_REQUEST', 400);
    }
    const persistedSchemaVersion = persistedLayout.schemaVersion;
    const updated = await client.query(
      `UPDATE meeting_document
          SET schema_version = $3::int, source_template_id = $4::uuid, source_template_version = $5::int, layout_json = $6::jsonb, theme_json = $7::jsonb, revision = revision + 1, updated_by_user_id = $8::uuid, updated_at = now()
        WHERE id = $1::uuid AND ward_id = $2::uuid AND revision = $9::int
        RETURNING id, revision`,
      [current.id, wardId, persistedSchemaVersion, sourceTemplateId, sourceTemplateVersion, JSON.stringify(persistedLayout), JSON.stringify(persistedLayout.theme), session.user.id, revision]
    );
    if (!updated.rows[0]) { await client.query('ROLLBACK'); return errorResponse('The program changed in another session', 'REVISION_CONFLICT', 409); }
    await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name || session.user.email || null, action: 'PROGRAM_DESIGN_UPDATED', entityType: 'meeting_document', entityId: String(current.id), details: { meetingId, revision: Number((updated.rows[0] as { revision: number }).revision) }, source: 'manual_ui', severity: 'notice' });
    await client.query('COMMIT');
    return NextResponse.json({ success: true, revision: Number((updated.rows[0] as { revision: number }).revision), document: persistedLayout });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to save program design', 'INTERNAL_ERROR', 500);
  } finally { client.release(); }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const body = saveSchema.omit({ expectedRevision: true }).safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse('Invalid program design payload', 'BAD_REQUEST', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const contextData = await readContext(client, wardId, meetingId);
    if (!contextData) { await client.query('ROLLBACK'); return errorResponse('Meeting not found', 'NOT_FOUND', 404); }
    const current = contextData.row?.layout_json ?? fullPageFallback();
    const currentSimpleLayout = current && typeof current === 'object' && (current as { schemaVersion?: unknown }).schemaVersion === 2 ? downgradeToV1(parseAdvancedLayout(current)) : current;
    let warnings: string[] = [];
    try {
      if (body.data.mode === 'ADVANCED') {
        const settings = await client.query('SELECT allow_advanced_program_designer FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1', [wardId]);
        const enabled = canUseAdvancedProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, { allowAdvancedProgramDesigner: settings.rows[0]?.allow_advanced_program_designer === true });
        if (!enabled) { await client.query('ROLLBACK'); return errorResponse('Advanced Mode is not enabled for this ward', 'FORBIDDEN', 403); }
        const advanced = parseAdvancedLayout(body.data.document);
        warnings = [];
        validatePublicDocumentLayout(projectAdvancedLayoutForPublic(advanced), ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE']);
      } else {
        const validated = validateSimpleModeDraft(body.data.document, currentSimpleLayout);
        warnings = validated.warnings;
        validatePublicDocumentLayout(validated.layout, ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE']);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof SimpleModeValidationError) return errorResponse(error.message, error.code, 422);
      return errorResponse('Program cannot be previewed publicly', 'UNSAFE_PUBLIC_DOCUMENT', 422);
    }
    await client.query('ROLLBACK');
    return NextResponse.json({ valid: true, warnings, publicSafe: true });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to validate program design', 'INTERNAL_ERROR', 500);
  } finally { client.release(); }
}
