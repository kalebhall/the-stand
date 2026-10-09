import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canEditProgramDesign, canUseAdvancedProgramDesigner, canViewProgramDesigner } from '@/src/auth/roles';
import { BUILT_IN_TEMPLATES } from '@/src/document-designer/built-in-templates';
import {
  buildPublicPreviewSource,
  getSimpleModeProperties,
  SimpleModeValidationError,
  validateSimpleModeDraft
} from '@/src/document-designer/meeting-document-service';
import { parseTemplateLayout } from '@/src/document-designer/template-service';
import { allBlocks, validatePublicDocumentLayout } from '@/src/document-designer/public-safety';
import { getRegisteredBlockDefinition } from '@/src/document-designer/registry';
import {
  mergeSimpleIntoAdvanced,
  normalizeToAdvanced,
  downgradeToV1,
  parseAdvancedLayout,
  projectAdvancedLayoutForPublic,
  type AdvancedDocumentLayout
} from '@/src/document-designer/advanced-schema';
import { assertNoLockedChanges, LockedLayoutError } from '@/src/document-designer/lock-enforcement';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isAdvancedDesignerEnabled, isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import type { DocumentLayout } from '@/src/document-designer/types';
import { isWardModuleEnabled, isWardModuleEnabledInTransaction } from '@/src/modules/service';
import {
  clearLegacyTitleProvenance,
  ensureProgramDocument,
  loadProgramDocumentRecord,
  updateProgramDocument
} from '@/src/programs/persistence';
import { listReadableMedia } from '@/src/document-designer/media-service';

const saveSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    document: z.unknown(),
    templateId: z.string().trim().min(1).optional(),
    mode: z.enum(['SIMPLE', 'ADVANCED']).default('SIMPLE')
  })
  .strict();
const fullPageFallback = () => BUILT_IN_TEMPLATES.find((template) => template.key === 'full-page-standard')!.layout;

function errorResponse(message: string, code: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...details }, { status });
}

async function readContext(client: Awaited<ReturnType<typeof pool.connect>>, wardId: string, meetingId: string) {
  const meetingResult = await client.query(
    `SELECT m.id, m.meeting_date, m.meeting_type, m.location, w.name AS ward_name, w.default_locale
       FROM meeting m JOIN ward w ON w.id = m.ward_id
      WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1`,
    [meetingId, wardId]
  );
  if (!meetingResult.rows[0]) return null;

  const itemsResult = await client.query(
    `SELECT item_type, title, topic, program_notes, hymn_number, hymn_title, sequence, introduction_roles
       FROM meeting_program_item
      WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
      ORDER BY sequence ASC`,
    [meetingId, wardId]
  );
  const announcementsResult = await client.query(
    `SELECT title
     FROM announcement
    WHERE ward_id = $1::uuid
      AND include_in_program = TRUE
      AND (is_permanent = TRUE OR ((start_date IS NULL OR start_date <= $2::date) AND (end_date IS NULL OR end_date >= $2::date)))
    ORDER BY created_at DESC`,
    [wardId, meetingResult.rows[0].meeting_date]
  );
  const shareResult = await client.query(
    `SELECT token FROM public_program_share
      WHERE ward_id = $1::uuid AND meeting_id = $2::uuid
        AND active_render_id IS NOT NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [wardId, meetingId]
  );
  const readableMedia = await listReadableMedia(client, wardId);
  const settingsResult = await client.query(
    'SELECT allow_advanced_program_designer FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1',
    [wardId]
  );
  const meeting = meetingResult.rows[0] as {
    id: string;
    meeting_date: string;
    meeting_type: string;
    location: string | null;
    ward_name: string | null;
    default_locale: string;
  };
  const row = await loadProgramDocumentRecord(client, { wardId, meetingId });
  const layout = row?.layout_json ?? fullPageFallback();
  const revision = Number(row?.revision ?? 1);
  const profile = {
    allowAdvancedProgramDesigner:
      (settingsResult.rows[0] as { allow_advanced_program_designer?: boolean } | undefined)?.allow_advanced_program_designer === true
  };
  const items = itemsResult.rows as Array<{
    item_type: string;
    title: string | null;
    topic: string | null;
    program_notes: string | null;
    hymn_number: string | null;
    hymn_title: string | null;
    sequence: number;
    introduction_roles: { presiding?: string | null; conducting?: string | null } | null;
  }>;
  const previewSource = buildPublicPreviewSource(
    { meetingDate: meeting.meeting_date, meetingType: meeting.meeting_type, wardName: meeting.ward_name, locale: meeting.default_locale },
    items.map((item) => ({
      itemType: item.item_type,
      title: item.title,
      topic: item.topic,
      programNotes: item.program_notes,
      hymnNumber: item.hymn_number,
      hymnTitle: item.hymn_title,
      sequence: item.sequence,
      introductionRoles: item.introduction_roles
    })),
    announcementsResult.rows as Array<{ title: string }>
  );
  return {
    meeting,
    row,
    layout,
    revision,
    profile,
    items,
    previewSource: {
      ...previewSource,
      location: meeting.location,
      publicUrl: shareResult.rows[0]?.token
        ? `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/p/${shareResult.rows[0].token}`
        : null,
      media: Object.fromEntries(
        readableMedia
          .filter((asset) => asset.url)
          .map((asset) => [
            asset.id,
            {
              url: `/api/w/${encodeURIComponent(wardId)}/media/${encodeURIComponent(asset.id)}`,
              altText: asset.alt_text,
              isDecorative: asset.is_decorative
            }
          ])
      )
    }
  };
}

async function ensureDocument(client: Awaited<ReturnType<typeof pool.connect>>, wardId: string, meetingId: string, userId: string) {
  return ensureProgramDocument(client, { wardId, meetingId, userId, defaultLayout: fullPageFallback() });
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (
    !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) ||
    !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))
  )
    return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return errorResponse('Forbidden', 'FORBIDDEN', 403);
    }
    await client.query('LOCK TABLE meeting_document IN ROW EXCLUSIVE MODE');
    const contextData = await readContext(client, wardId, meetingId);
    if (!contextData) {
      await client.query('ROLLBACK');
      return errorResponse('Meeting not found', 'NOT_FOUND', 404);
    }
    const document = await ensureDocument(client, wardId, meetingId, session.user.id);
    const advancedModeAvailable =
      isAdvancedDesignerFeatureEnabled() &&
      isAdvancedDesignerEnabled({
        repositoryEnabled: true,
        wardEnabled: contextData.profile.allowAdvancedProgramDesigner,
        capabilityEnabled: canUseAdvancedProgramDesigner(
          { roles: session.user.roles, activeWardId: session.activeWardId },
          wardId,
          contextData.profile
        )
      });
    const advancedLayout = parseAdvancedLayout(document.layout_json);
    const layout = downgradeToV1(advancedLayout);
    await client.query('COMMIT');
    return NextResponse.json({
      meeting: { id: contextData.meeting.id, meetingDate: contextData.meeting.meeting_date, meetingType: contextData.meeting.meeting_type },
      document: {
        id: document.id,
        layout,
        ...(advancedModeAvailable ? { advancedLayout } : {}),
        theme: document.theme_json ?? layout.theme,
        revision: Number(document.revision ?? 1),
        sourceTemplateId: document.source_template_id ?? null,
        sourceTemplateVersion: document.source_template_version ?? null,
        schemaVersion: advancedModeAvailable ? advancedLayout.schemaVersion : layout.schemaVersion
      },
      simpleMode: getSimpleModeProperties(layout, advancedModeAvailable),
      previewSource: contextData.previewSource
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to load program design', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
}

export async function PUT(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canEditProgramDesign({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId))
    return errorResponse('Forbidden', 'FORBIDDEN', 403);
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const body = saveSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse('Invalid program design payload', 'BAD_REQUEST', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return errorResponse('Forbidden', 'FORBIDDEN', 403);
    }
    await client.query('LOCK TABLE meeting_document IN ROW EXCLUSIVE MODE');
    const meeting = await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1 FOR UPDATE', [
      meetingId,
      wardId
    ]);
    if (!meeting.rows[0]) {
      await client.query('ROLLBACK');
      return errorResponse('Meeting not found', 'NOT_FOUND', 404);
    }
    const current = await ensureDocument(client, wardId, meetingId, session.user.id);
    const settingsResult = await client.query(
      'SELECT allow_advanced_program_designer FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1',
      [wardId]
    );
    const advancedModeAvailable =
      isAdvancedDesignerFeatureEnabled() &&
      isAdvancedDesignerEnabled({
        repositoryEnabled: true,
        wardEnabled:
          (settingsResult.rows[0] as { allow_advanced_program_designer?: boolean } | undefined)?.allow_advanced_program_designer === true,
        capabilityEnabled: canUseAdvancedProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, {
          allowAdvancedProgramDesigner:
            (settingsResult.rows[0] as { allow_advanced_program_designer?: boolean } | undefined)?.allow_advanced_program_designer === true
        })
      });
    const revision = Number(current.revision);
    if (body.data.expectedRevision !== revision) {
      await client.query('ROLLBACK');
      return errorResponse('The program changed in another session', 'REVISION_CONFLICT', 409, { currentRevision: revision });
    }
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
          sourceTemplateId = null;
          sourceTemplateVersion = 1;
        } else {
          const templateResult = await client.query(
            `SELECT t.id, v.version, v.layout_json
               FROM document_template t
               JOIN document_template_version v ON v.id = t.current_published_version_id AND v.template_id = t.id
              WHERE t.id = $1::uuid AND t.document_type = 'SACRAMENT_PROGRAM'
                AND t.status <> 'ARCHIVED'
                AND ((t.scope_type = 'SYSTEM' AND t.scope_id IS NULL AND t.status = 'PUBLISHED' AND t.current_published_version_id IS NOT NULL)
                  OR (t.scope_type = 'STAKE' AND t.status = 'PUBLISHED' AND t.scope_id = (SELECT stake_id FROM ward WHERE id = $2::uuid))
                  OR (t.scope_type = 'WARD' AND t.scope_id = $2::uuid)
                  OR (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = $2::uuid AND t.created_by_user_id = $3::uuid))
              LIMIT 1`,
            [body.data.templateId, wardId, session.user.id]
          );
          if (!templateResult.rows[0]) {
            await client.query('ROLLBACK');
            return errorResponse('Template not found', 'TEMPLATE_NOT_FOUND', 404);
          }
          const templateRow = templateResult.rows[0] as { id: string; version: number; layout_json: unknown };
          validated = { layout: parseTemplateLayout(templateRow.layout_json), warnings: [] };
          if (
            !advancedModeAvailable &&
            allBlocks(validated.layout).some(
              (block) => getRegisteredBlockDefinition(validated.layout.documentType, block.type).exposure === 'ADVANCED'
            )
          ) {
            throw new SimpleModeValidationError('ADVANCED_BLOCK', 'This template requires Advanced Mode');
          }
          sourceTemplateId = templateRow.id;
          sourceTemplateVersion = Number(templateRow.version);
        }
      } else {
        validated = validateSimpleModeDraft(
          body.data.document,
          current.layout_json &&
            typeof current.layout_json === 'object' &&
            (current.layout_json as { schemaVersion?: unknown }).schemaVersion === 2
            ? downgradeToV1(parseAdvancedLayout(current.layout_json))
            : current.layout_json
        );
      }
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof SimpleModeValidationError)
        return errorResponse(error.message, error.code, error.code === 'INVALID_LAYOUT' ? 400 : 422);
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
    const persistedLayout = clearLegacyTitleProvenance(
      advancedToSave ??
        (current.layout_json &&
        typeof current.layout_json === 'object' &&
        (current.layout_json as { schemaVersion?: unknown }).schemaVersion === 2
          ? mergeSimpleIntoAdvanced(parseAdvancedLayout(current.layout_json), validated.layout)
          : validated.layout),
      current.layout_json,
      Boolean(body.data.templateId)
    );
    try {
      const previousAdvanced =
        current.layout_json &&
        typeof current.layout_json === 'object' &&
        (current.layout_json as { schemaVersion?: unknown }).schemaVersion === 2
          ? parseAdvancedLayout(current.layout_json)
          : normalizeToAdvanced(current.layout_json);
      assertNoLockedChanges(previousAdvanced, parseAdvancedLayout(persistedLayout));
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof LockedLayoutError) return errorResponse(error.message, 'LOCKED_LAYOUT', 409);
      return errorResponse('Invalid program design', 'BAD_REQUEST', 400);
    }
    const persistedSchemaVersion = persistedLayout.schemaVersion;
    const updated = await updateProgramDocument(client, {
      id: String(current.id),
      wardId,
      schemaVersion: persistedSchemaVersion,
      sourceTemplateId,
      sourceTemplateVersion,
      layout: persistedLayout,
      theme: persistedLayout.theme,
      updatedByUserId: session.user.id,
      expectedRevision: revision
    });
    if (!updated) {
      const latest = await client.query(
        'SELECT revision FROM meeting_document WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
        [current.id, wardId]
      );
      const currentRevision = Number((latest.rows[0] as { revision?: number } | undefined)?.revision ?? revision);
      await client.query('ROLLBACK');
      return errorResponse('The program changed in another session', 'REVISION_CONFLICT', 409, { currentRevision });
    }
    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'PROGRAM_DESIGN_UPDATED',
      entityType: 'meeting_document',
      entityId: String(current.id),
      details: { meetingId, revision: updated.revision },
      source: 'manual_ui',
      severity: 'notice'
    });
    await client.query('COMMIT');
    return NextResponse.json({
      success: true,
      revision: updated.revision,
      document: { layout: persistedLayout, schemaVersion: persistedSchemaVersion, sourceTemplateId, sourceTemplateVersion }
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to save program design', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (
    !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) ||
    !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))
  )
    return errorResponse('Forbidden', 'FORBIDDEN', 403);
  if (!isAdvancedDesignerFeatureEnabled()) return errorResponse('Advanced designer is disabled', 'FEATURE_DISABLED', 404);
  const body = saveSchema.omit({ expectedRevision: true }).safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse('Invalid program design payload', 'BAD_REQUEST', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return errorResponse('Forbidden', 'FORBIDDEN', 403);
    }
    await client.query('LOCK TABLE meeting_document IN ROW EXCLUSIVE MODE');
    const contextData = await readContext(client, wardId, meetingId);
    if (!contextData) {
      await client.query('ROLLBACK');
      return errorResponse('Meeting not found', 'NOT_FOUND', 404);
    }
    const current = contextData.row?.layout_json ?? fullPageFallback();
    const currentSimpleLayout =
      current && typeof current === 'object' && (current as { schemaVersion?: unknown }).schemaVersion === 2
        ? downgradeToV1(parseAdvancedLayout(current))
        : current;
    let warnings: string[] = [];
    try {
      if (body.data.mode === 'ADVANCED') {
        const settings = await client.query(
          'SELECT allow_advanced_program_designer FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1',
          [wardId]
        );
        const enabled =
          isAdvancedDesignerFeatureEnabled() &&
          canUseAdvancedProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, {
            allowAdvancedProgramDesigner: settings.rows[0]?.allow_advanced_program_designer === true
          });
        if (!enabled) {
          await client.query('ROLLBACK');
          return errorResponse('Advanced Mode is not enabled for this ward', 'FORBIDDEN', 403);
        }
        const advanced = parseAdvancedLayout(body.data.document);
        warnings = [];
        validatePublicDocumentLayout(downgradeToV1(projectAdvancedLayoutForPublic(advanced)), [
          'MEETING_PROGRAM',
          'ANNOUNCEMENTS',
          'PRESIDING_CONDUCTING',
          'MUSIC_LEADERS',
          'QR_CODE',
          'CUSTOM_LINK'
        ]);
      } else {
        const validated = validateSimpleModeDraft(body.data.document, currentSimpleLayout);
        warnings = validated.warnings;
        validatePublicDocumentLayout(validated.layout, [
          'MEETING_PROGRAM',
          'ANNOUNCEMENTS',
          'PRESIDING_CONDUCTING',
          'MUSIC_LEADERS',
          'QR_CODE',
          'CUSTOM_LINK'
        ]);
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
  } finally {
    client.release();
  }
}
