import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { z } from 'zod';

import { buildFieldDiff, recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { hasRole, canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import {
  DEFAULT_WARD_DOCUMENT_SETTINGS,
  loadWardDocumentSettings,
  saveWardDocumentSettings,
  settingsResponse,
  type WardDocumentSettings
} from '@/src/document-designer/persistence';

const settingsSchema = z.object({
  allowAdvancedProgramDesigner: z.boolean().optional(),
  allowProgramEditorPublish: z.boolean().optional(),
  allowProgramEditorRepublish: z.boolean().optional(),
  allowProgramEditorRollback: z.boolean().optional(),
  allowProgramEditorCreateTemplates: z.boolean().optional(),
  allowProgramEditorDeleteMedia: z.boolean().optional(),
  publicProgramExpirationDays: z.number().int().min(1).max(3650).nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one program setting is required');

type ProgramSettings = {
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
  const allowed = canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);
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
  const denied = await accessResponse(session, wardId, true);
  if (denied) return denied;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid program settings', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const before = await loadWardDocumentSettings(client, wardId);
    const beforeSettings = rowToProgramSettings(before);
    const nextSettings = { ...beforeSettings, ...parsed.data };
    const after = await saveWardDocumentSettings(client, wardId, session.user.id, nextSettings);
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
