import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner, hasRole } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/platform/db/context';
import { updateReusableBlockSchema, uuid, validateReusableSnapshot } from '@/src/document-designer/reusable-block-library';

function response(status: 400 | 401 | 403 | 404 | 409 | 500, error: string, code: string) {
  return NextResponse.json({ error, code }, { status });
}

async function getSession(wardId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: response(401, 'Unauthorized', 'UNAUTHORIZED') };
  const stakeAdmin = Boolean(session.activeStakeId && session.stakeAssignments?.some((assignment) => assignment.stakeId === session.activeStakeId && assignment.roleNames.some((role) => role.toUpperCase() === 'STAKE_ADMIN')));
  if (!isAdvancedDesignerFeatureEnabled() || !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return { response: response(403, 'Program Studio is disabled', 'MODULE_DISABLED') };
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) && !(session.activeWardId === wardId && stakeAdmin)) return { response: response(403, 'Forbidden', 'FORBIDDEN') };
  if (!hasRole(session.user.roles, 'STAND_ADMIN') && !hasRole(session.user.roles, 'PROGRAM_EDITOR') && !stakeAdmin) return { response: response(403, 'Reusable block management is not permitted', 'FORBIDDEN') };
  return { session };
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; blockId: string }> }) {
  const { wardId, blockId } = await context.params;
  if (!uuid.safeParse(wardId).success || !uuid.safeParse(blockId).success) return response(400, 'Invalid reusable block identifier', 'BAD_REQUEST');
  const access = await getSession(wardId);
  if (access.response) return access.response;
  const parsed = updateReusableBlockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response(400, 'Invalid reusable block update', 'BAD_REQUEST');
  if (parsed.data.archive === true && parsed.data.snapshot) return response(400, 'Archive and version update must be separate operations', 'BAD_REQUEST');
  let snapshot;
  if (parsed.data.snapshot) {
    try { snapshot = validateReusableSnapshot(parsed.data.snapshot); } catch { return response(400, 'Invalid reusable block snapshot', 'BAD_REQUEST'); }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { wardId, userId: access.session.user.id });
    const current = await client.query(`SELECT b.id, b.current_version, b.block_type, b.status
      FROM reusable_block b
     WHERE b.id = $1::uuid
       AND ((b.scope_type = 'PERSONAL' AND b.scope_id = $2::uuid AND b.owner_user_id = app.current_user_id())
         OR (b.scope_type = 'WARD' AND b.scope_id = $2::uuid)
         OR (b.scope_type = 'STAKE' AND EXISTS (SELECT 1 FROM ward w WHERE w.id = $2::uuid AND w.stake_id = b.scope_id)))
     FOR UPDATE`, [blockId, wardId]);
    if (!current.rows[0]) { await client.query('ROLLBACK'); return response(404, 'Reusable block not found', 'NOT_FOUND'); }
    if (current.rows[0].status !== 'ACTIVE') { await client.query('ROLLBACK'); return response(409, 'Archived reusable blocks cannot be updated', 'ARCHIVED'); }
    if (parsed.data.expectedVersion !== undefined && parsed.data.expectedVersion !== current.rows[0].current_version) { await client.query('ROLLBACK'); return response(409, 'Reusable block has a newer version', 'VERSION_CONFLICT'); }
    if (parsed.data.snapshot && parsed.data.snapshot.blockType !== current.rows[0].block_type) { await client.query('ROLLBACK'); return response(400, 'Block type cannot change between versions', 'BAD_REQUEST'); }
    if (parsed.data.name !== undefined || parsed.data.description !== undefined || parsed.data.archive !== undefined) {
      const result = await client.query(
        `UPDATE reusable_block
            SET name = COALESCE($2, name), description = CASE WHEN $3::boolean THEN $4 ELSE description END,
                status = CASE WHEN $5::boolean THEN 'ARCHIVED' ELSE status END, updated_at = now()
          WHERE id = $1::uuid`,
        [blockId, parsed.data.name ?? null, parsed.data.description !== undefined, parsed.data.description ?? null, parsed.data.archive === true]
      );
      if (result.rowCount !== 1) { await client.query('ROLLBACK'); return response(404, 'Reusable block not found or inactive', 'NOT_FOUND'); }
    }
    let version = current.rows[0].current_version;
    if (snapshot) {
      version += 1;
      await client.query('INSERT INTO reusable_block_version (reusable_block_id, version, snapshot_json) VALUES ($1::uuid, $2, $3::jsonb)', [blockId, version, JSON.stringify({ ...snapshot, version })]);
    }
    await client.query('COMMIT');
    return NextResponse.json({ id: blockId, version, archived: parsed.data.archive === true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42501') return response(403, 'Reusable block operation is not permitted', 'FORBIDDEN');
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') return response(409, 'Reusable block version conflict', 'VERSION_CONFLICT');
    return response(500, 'Failed to update reusable block', 'INTERNAL_ERROR');
  } finally { client.release(); }
}
