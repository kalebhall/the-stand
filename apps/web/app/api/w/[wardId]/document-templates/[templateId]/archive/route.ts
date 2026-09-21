import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageWardProgramTemplates, canViewProgramDesigner } from '@/src/auth/roles';
import { loadProgramPermissionProfile } from '@/src/document-designer/template-service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const errorResponse = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });

type Params = { wardId: string; templateId: string };

export async function POST(_: Request, context: { params: Promise<Params> }) {
  const session = await auth();
  const { wardId, templateId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const profile = await loadProgramPermissionProfile(client, wardId);
    if (!canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile)) {
      await client.query('ROLLBACK');
      return errorResponse('Forbidden', 'FORBIDDEN', 403);
    }
    const template = await client.query(
      `SELECT id, name, status FROM document_template
        WHERE id = $1::uuid AND document_type = 'SACRAMENT_PROGRAM'
          AND scope_type = 'WARD' AND scope_id = $2::uuid
        LIMIT 1 FOR UPDATE`,
      [templateId, wardId]
    );
    if (!template.rows[0]) {
      await client.query('ROLLBACK');
      return errorResponse('Template not found', 'NOT_FOUND', 404);
    }
    if ((template.rows[0] as { status: string }).status === 'ARCHIVED') {
      await client.query('ROLLBACK');
      return errorResponse('Template is already archived', 'CONFLICT', 409);
    }
    const archived = await client.query(
      `UPDATE document_template SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1::uuid AND scope_type = 'WARD' AND scope_id = $2::uuid
        RETURNING id, name, status, updated_at`,
      [templateId, wardId]
    );
    await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name || session.user.email || null, action: 'PROGRAM_TEMPLATE_ARCHIVED', entityType: 'document_template', entityId: templateId, details: {}, source: 'manual_ui', severity: 'notice' });
    await client.query('COMMIT');
    return NextResponse.json({ template: archived.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to archive document template', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
}
