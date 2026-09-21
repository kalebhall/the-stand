import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageWardProgramTemplates, canViewProgramDesigner } from '@/src/auth/roles';
import { getBuiltInTemplate } from '@/src/document-designer/built-in-templates';
import { loadProgramPermissionProfile, parseTemplateLayout } from '@/src/document-designer/template-service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const duplicateSchema = z.object({ name: z.string().trim().min(1).max(200).optional(), description: z.string().trim().max(2_000).nullable().optional() }).strict();

export async function POST(request: Request, context: { params: Promise<{ wardId: string; templateId: string }> }) {
  const session = await auth();
  const { wardId, templateId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const body = duplicateSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'Invalid duplicate payload', code: 'BAD_REQUEST' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const profile = await loadProgramPermissionProfile(client, wardId);
    if (!canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const builtIn = getBuiltInTemplate(templateId);
    let sourceName = builtIn?.name ?? 'Template';
    let description = builtIn?.description ?? null;
    let layout: ReturnType<typeof parseTemplateLayout>;
    if (builtIn) {
      layout = parseTemplateLayout(builtIn.layout);
    } else {
      const source = await client.query(
        `SELECT t.name, t.description, v.layout_json
           FROM document_template t
           JOIN document_template_version v ON v.id = t.current_published_version_id
          WHERE t.id = $1::uuid
            AND t.document_type = 'SACRAMENT_PROGRAM'
            AND ((t.scope_type = 'STAKE' AND t.status = 'PUBLISHED' AND t.scope_id = (SELECT stake_id FROM ward WHERE id = $2::uuid))
              OR (t.scope_type = 'WARD' AND t.scope_id = $2::uuid)
              OR (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = $2::uuid AND t.created_by_user_id = $3::uuid))
          LIMIT 1`,
        [templateId, wardId, session.user.id]
      );
      if (!source.rows[0]) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Template not found', code: 'NOT_FOUND' }, { status: 404 });
      }
      const sourceRow = source.rows[0] as Record<string, unknown>;
      sourceName = String(sourceRow.name);
      description = (sourceRow.description as string | null) ?? null;
      try {
        layout = parseTemplateLayout(sourceRow.layout_json);
      } catch {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Source template layout is invalid', code: 'INTERNAL_ERROR' }, { status: 500 });
      }
    }

    const name = body.data.name ?? `${sourceName} Copy`;
    const inserted = await client.query(
      `INSERT INTO document_template (scope_type, scope_id, document_type, name, description, status, created_by_user_id)
       VALUES ('WARD', $1::uuid, 'SACRAMENT_PROGRAM', $2::text, $3::text, 'DRAFT', $4::uuid)
       RETURNING id, name, description, status`,
      [wardId, name, body.data.description === undefined ? description : body.data.description, session.user.id]
    );
    const row = inserted.rows[0] as Record<string, unknown>;
    const version = await client.query(
      `INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, lock_json, created_by_user_id)
       VALUES ($1::uuid, 1, $2::int, $3::jsonb, $4::jsonb, $5::jsonb, $6::uuid)
       RETURNING id, version, schema_version, layout_json, theme_json, lock_json`,
      [row.id, layout.schemaVersion, JSON.stringify(layout), JSON.stringify(layout.theme), JSON.stringify(layout.lock ?? {}), session.user.id]
    );
    await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name || session.user.email || null, action: 'PROGRAM_TEMPLATE_DUPLICATED', entityType: 'document_template', entityId: String(row.id), details: { sourceTemplateId: templateId }, source: 'manual_ui', severity: 'notice' });
    await client.query('COMMIT');
    return NextResponse.json({ template: { id: row.id, source: 'WARD', scopeType: 'WARD', name: row.name, description: row.description, status: row.status, version: version.rows[0] } }, { status: 201 });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to duplicate document template', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
