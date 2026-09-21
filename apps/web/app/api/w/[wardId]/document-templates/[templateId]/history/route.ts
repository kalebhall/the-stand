import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const errorResponse = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });

type Params = { wardId: string; templateId: string };

export async function GET(_: Request, context: { params: Promise<Params> }) {
  const session = await auth();
  const { wardId, templateId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const template = await client.query(
      `SELECT id, name, scope_type, status FROM document_template
        WHERE id = $1::uuid AND document_type = 'SACRAMENT_PROGRAM'
          AND ((scope_type = 'STAKE' AND status = 'PUBLISHED' AND scope_id = (SELECT stake_id FROM ward WHERE id = $2::uuid))
            OR (scope_type = 'WARD' AND scope_id = $2::uuid)
            OR (scope_type = 'PERSONAL_DRAFT' AND scope_id = $2::uuid AND created_by_user_id = $3::uuid))
        LIMIT 1`,
      [templateId, wardId, session.user.id]
    );
    if (!template.rows[0]) {
      await client.query('ROLLBACK');
      return errorResponse('Template not found', 'NOT_FOUND', 404);
    }
    const versions = await client.query(
      `SELECT id, version, schema_version, layout_json, theme_json, lock_json, created_at, created_by_user_id
         FROM document_template_version WHERE template_id = $1::uuid ORDER BY version ASC`,
      [templateId]
    );
    await client.query('COMMIT');
    return NextResponse.json({ template: template.rows[0], history: versions.rows });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to load template history', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
}
