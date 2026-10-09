import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { z } from 'zod';

import { buildFieldDiff, recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings, canViewProgramDesigner, hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled, isWardModuleEnabledInTransaction } from '@/src/modules/service';
import {
  DEFAULT_WARD_DOCUMENT_SETTINGS,
  loadWardDocumentSettings,
  saveDefaultSacramentTemplate,
  saveWardDocumentSettings,
  settingsResponse,
  type WardDocumentSettings
} from '@/src/document-designer/persistence';
import { BUILT_IN_TEMPLATES } from '@/src/document-designer/built-in-templates';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';

const settingsSchema = z.object({
  defaultSacramentTemplate: z.string().regex(/^(builtin:[a-z0-9-]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i).nullable().optional(),
  allowAdvancedProgramDesigner: z.boolean().optional(),
  allowProgramEditorPublish: z.boolean().optional(),
  allowProgramEditorRepublish: z.boolean().optional(),
  allowProgramEditorRollback: z.boolean().optional(),
  allowProgramEditorCreateTemplates: z.boolean().optional(),
  allowProgramEditorDeleteMedia: z.boolean().optional(),
  publicProgramExpirationDays: z.number().int().min(1).max(3650).nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one program setting is required');

type ProgramSettings = {
  defaultSacramentTemplateId: string | null;
  defaultSacramentTemplateKey: string | null;
  allowAdvancedProgramDesigner: boolean;
  allowProgramEditorPublish: boolean;
  allowProgramEditorRepublish: boolean;
  allowProgramEditorRollback: boolean;
  allowProgramEditorCreateTemplates: boolean;
  allowProgramEditorDeleteMedia: boolean;
  publicProgramExpirationDays: number | null;
};

function rowToProgramSettings(row: WardDocumentSettings | null): ProgramSettings {
  const value = row ?? ({ ward_id: '', ...DEFAULT_WARD_DOCUMENT_SETTINGS } satisfies WardDocumentSettings);
  return {
    defaultSacramentTemplateId: value.default_sacrament_template_id,
    defaultSacramentTemplateKey: value.default_sacrament_template_key,
    allowAdvancedProgramDesigner: value.allow_advanced_program_designer,
    allowProgramEditorPublish: value.allow_program_editor_publish,
    allowProgramEditorRepublish: value.allow_program_editor_republish,
    allowProgramEditorRollback: value.allow_program_editor_rollback,
    allowProgramEditorCreateTemplates: value.allow_program_editor_create_templates,
    allowProgramEditorDeleteMedia: value.allow_program_editor_delete_media,
    publicProgramExpirationDays: value.public_program_expiration_days
  };
}

async function accessResponse(session: Session | null, wardId: string, requireAdmin: boolean) {
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const allowed =
    canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) ||
    canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);
  if (!allowed || !(await isWardModuleEnabled(wardId, session.user.id, 'programs')) || (requireAdmin && !hasRole(session.user.roles, 'STAND_ADMIN'))) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }
  return null;
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const session = await auth();
  const denied = await accessResponse(session, wardId, false);
  if (denied) return denied;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    const row = await loadWardDocumentSettings(client, wardId);
    await client.query('COMMIT');
    return NextResponse.json({ settings: settingsResponse(row) });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to load program settings', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const session = await auth();
  const denied = await accessResponse(session, wardId, false);
  if (denied) return denied;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid program settings', code: 'BAD_REQUEST' }, { status: 400 });
  }
  const keys = Object.keys(parsed.data);
  const templateOnly = keys.length === 1 && keys[0] === 'defaultSacramentTemplate';
  const hasTemplateSelection = Object.prototype.hasOwnProperty.call(parsed.data, 'defaultSacramentTemplate');
  if (hasTemplateSelection && !isAdvancedDesignerFeatureEnabled()) {
    return NextResponse.json({ error: 'Program templates are disabled', code: 'FORBIDDEN' }, { status: 403 });
  }
  if (templateOnly) {
    if (!session?.user?.id || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
  } else if (!hasRole(session.user.roles, 'STAND_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    const before = await loadWardDocumentSettings(client, wardId);
    const beforeSettings = rowToProgramSettings(before);
    let nextSettings = { ...beforeSettings };
    if (hasTemplateSelection) {
      const selected = parsed.data.defaultSacramentTemplate;
      if (selected && selected.toLowerCase().startsWith('builtin:')) {
        const key = selected.slice('builtin:'.length).toLowerCase();
        if (!BUILT_IN_TEMPLATES.some((template) => template.key === key)) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'Invalid default program template', code: 'BAD_REQUEST' }, { status: 400 });
        }
        nextSettings = { ...nextSettings, defaultSacramentTemplateId: null, defaultSacramentTemplateKey: key };
      } else if (selected) {
        const templateResult = await client.query(
          `SELECT id FROM document_template
             WHERE id = $1::uuid
               AND document_type = 'SACRAMENT_PROGRAM'
               AND status = 'PUBLISHED'
               AND current_published_version_id IS NOT NULL
               AND ((scope_type = 'WARD' AND scope_id = $2::uuid)
                 OR (scope_type = 'SYSTEM' AND scope_id IS NULL))
             LIMIT 1`,
          [selected, wardId]
        );
        if (!templateResult.rows[0]) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'Default template must be a published ward template', code: 'BAD_REQUEST' }, { status: 400 });
        }
        nextSettings = { ...nextSettings, defaultSacramentTemplateId: selected, defaultSacramentTemplateKey: null };
      } else {
        nextSettings = { ...nextSettings, defaultSacramentTemplateId: null, defaultSacramentTemplateKey: null };
      }
    }
    if (!templateOnly) {
      const permissionSettings = { ...parsed.data };
      delete permissionSettings.defaultSacramentTemplate;
      nextSettings = { ...nextSettings, ...permissionSettings };
    }
    const after = templateOnly
      ? await saveDefaultSacramentTemplate(
          client,
          wardId,
          session.user.id,
          nextSettings.defaultSacramentTemplateId,
          nextSettings.defaultSacramentTemplateKey
        )
      : await saveWardDocumentSettings(client, wardId, session.user.id, nextSettings);
    const afterSettings = rowToProgramSettings(after);
    const expirationChanged = beforeSettings.publicProgramExpirationDays !== afterSettings.publicProgramExpirationDays;
    const changes = buildFieldDiff(before ? { ...beforeSettings } : null, afterSettings, ['publicProgramExpirationDays']);
    if (changes) {
      await recordAuditEvent(client, {
        wardId,
        userId: session.user.id,
        actorName: session.user.name || session.user.email || null,
        actorRole: session.user.roles?.[0] || null,
        action: 'PROGRAM_SETTINGS_UPDATED',
        entityType: 'ward_setting',
        entityId: wardId,
        changes,
        previousState: before ? { ...beforeSettings } : null,
        details: { setting: 'ward_document_settings' },
        source: 'manual_ui',
        severity: 'notice'
      });
    }
    if (expirationChanged) {
      await recordAuditEvent(client, {
        wardId,
        userId: session.user.id,
        actorName: session.user.name || session.user.email || null,
        actorRole: session.user.roles?.[0] || null,
        action: 'PROGRAM_PUBLIC_EXPIRATION_UPDATED',
        entityType: 'ward_setting',
        entityId: wardId,
        changes: { publicProgramExpirationDays: {
          old: beforeSettings.publicProgramExpirationDays,
          new: afterSettings.publicProgramExpirationDays
        } },
        previousState: { publicProgramExpirationDays: beforeSettings.publicProgramExpirationDays },
        details: { setting: 'public_program_expiration_days' },
        source: 'manual_ui',
        severity: 'notice'
      });
    }
    await client.query('COMMIT');
    return NextResponse.json({ settings: settingsResponse(after) });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to save program settings', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
