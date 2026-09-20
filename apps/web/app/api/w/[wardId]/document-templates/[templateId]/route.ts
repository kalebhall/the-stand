import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { getBuiltInTemplate } from '@/src/document-designer/built-in-templates';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

export async function GET(_: Request, context: { params: Promise<{ wardId: string; templateId: string }> }) {
  const session = await auth();
  const { wardId, templateId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });

  const builtIn = getBuiltInTemplate(templateId);
  if (builtIn) {
    return NextResponse.json({
      template: {
        id: builtIn.key,
        key: builtIn.key,
        source: builtIn.source,
        scopeType: 'SYSTEM',
        name: builtIn.name,
        description: builtIn.description,
        documentType: builtIn.documentType,
        status: 'PUBLISHED',
        thumbnail: builtIn.thumbnail,
        version: { version: 1, schemaVersion: builtIn.layout.schemaVersion, layout: builtIn.layout, theme: builtIn.layout.theme, lock: builtIn.layout.lock ?? null }
      }
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result = await client.query(
      `SELECT t.id, t.template_key, t.scope_type, t.scope_id, t.document_type, t.name, t.description, t.status,
              t.current_published_version_id, t.created_by_user_id,
              v.id AS version_id, v.version, v.schema_version, v.layout_json, v.theme_json, v.lock_json
         FROM document_template t
         LEFT JOIN document_template_version v ON v.id = t.current_published_version_id
        WHERE t.id = $1::uuid
          AND t.document_type = 'SACRAMENT_PROGRAM'
          AND ((t.scope_type = 'STAKE' AND t.status = 'PUBLISHED')
            OR (t.scope_type = 'WARD' AND t.scope_id = $2::uuid)
            OR (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = $2::uuid AND t.created_by_user_id = $3::uuid))
        LIMIT 1`,
      [templateId, wardId, session.user.id]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Template not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const row = result.rows[0] as Record<string, unknown>;
    const template = {
      id: row.id,
      key: row.template_key,
      source: row.scope_type === 'SYSTEM' ? 'BUILT_IN' : row.scope_type,
      scopeType: row.scope_type,
      name: row.name,
      description: row.description,
      documentType: row.document_type,
      status: row.status,
      version: row.version_id
        ? { id: row.version_id, version: row.version, schemaVersion: row.schema_version, layout: row.layout_json, theme: row.theme_json, lock: row.lock_json }
        : null
    };
    await client.query('COMMIT');
    return NextResponse.json({ template });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to load document template', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
