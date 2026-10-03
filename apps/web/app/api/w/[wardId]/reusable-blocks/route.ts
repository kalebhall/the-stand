import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner, hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/platform/db/context';
import { createReusableBlockSchema, scopeOwner, uuid, validateReusableSnapshot } from '@/src/document-designer/reusable-block-library';

function errorResponse(status: 400 | 401 | 403 | 404 | 409 | 500, message: string, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

function isActiveStakeAdmin(session: { activeStakeId?: string | null; stakeAssignments?: readonly { stakeId: string; roleNames: readonly string[] }[] }) {
  return Boolean(session.activeStakeId && session.stakeAssignments?.some((assignment) => assignment.stakeId === session.activeStakeId && assignment.roleNames.some((role) => role.toUpperCase() === 'STAKE_ADMIN')));
}

async function access(wardId: string, manage = false) {
  const session = await auth();
  if (!session?.user?.id) return { response: errorResponse(401, 'Unauthorized', 'UNAUTHORIZED') };
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) && !(session.activeWardId === wardId && isActiveStakeAdmin(session))) return { response: errorResponse(403, 'Forbidden', 'FORBIDDEN') };
  if (manage && !hasRole(session.user.roles, 'STAND_ADMIN') && !hasRole(session.user.roles, 'PROGRAM_EDITOR') && !isActiveStakeAdmin(session)) return { response: errorResponse(403, 'Reusable block management is not permitted', 'FORBIDDEN') };
  return { session };
}

async function withContext<T>(wardId: string, userId: string, operation: (client: Awaited<ReturnType<typeof pool.connect>>) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { wardId, userId });
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  if (!uuid.safeParse(wardId).success) return errorResponse(400, 'Invalid ward ID', 'BAD_REQUEST');
  const result = await access(wardId);
  if (result.response) return result.response;
  try {
    const blocks = await withContext(wardId, result.session.user.id, async (client) => {
      const query = await client.query(`
        SELECT b.id, b.scope_type, b.scope_id, b.owner_user_id, b.block_type, b.name, b.description, b.status,
               b.created_by_user_id, b.current_version, v.snapshot_json
          FROM reusable_block b
          JOIN reusable_block_version v ON v.reusable_block_id = b.id AND v.version = b.current_version
         WHERE b.status = 'ACTIVE'
           AND ((b.scope_type = 'WARD' AND b.scope_id = $1::uuid)
             OR (b.scope_type = 'PERSONAL' AND b.scope_id = $1::uuid AND b.owner_user_id = app.current_user_id())
             OR (b.scope_type = 'STAKE' AND EXISTS (SELECT 1 FROM ward w WHERE w.id = $1::uuid AND w.stake_id = b.scope_id)))
         ORDER BY b.scope_type, b.name`, [wardId]);
      return query.rows;
    });
    return NextResponse.json({ blocks });
  } catch {
    return errorResponse(500, 'Failed to load reusable blocks', 'INTERNAL_ERROR');
  }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  if (!uuid.safeParse(wardId).success) return errorResponse(400, 'Invalid ward ID', 'BAD_REQUEST');
  const result = await access(wardId, true);
  if (result.response) return result.response;
  const body = await request.json().catch(() => null);
  const parsed = createReusableBlockSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, 'Invalid reusable block payload', 'BAD_REQUEST');
  if (parsed.data.scope === 'STAKE' && !isActiveStakeAdmin(result.session) && !hasRole(result.session.user.roles, 'STAND_ADMIN')) return errorResponse(403, 'Stake reusable block management is not permitted', 'FORBIDDEN');
  let snapshot;
  try {
    snapshot = validateReusableSnapshot(parsed.data.snapshot);
    if (snapshot.version !== 1) return errorResponse(400, 'New reusable blocks must start at version 1', 'BAD_REQUEST');
  } catch {
    return errorResponse(400, 'Invalid reusable block snapshot', 'BAD_REQUEST');
  }
  try {
    const block = await withContext(wardId, result.session.user.id, async (client) => {
      const ward = await client.query('SELECT stake_id FROM ward WHERE id = $1::uuid', [wardId]);
      const stakeId = ward.rows[0]?.stake_id;
      if (!stakeId) throw new Error('WARD_NOT_FOUND');
      const ownership = scopeOwner(parsed.data.scope, result.session.user.id, wardId, stakeId);
      const inserted = await client.query(
        `INSERT INTO reusable_block (scope_type, scope_id, owner_user_id, block_type, name, description)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6) RETURNING id`,
        [ownership.scopeType, ownership.scopeId, ownership.ownerUserId, snapshot.blockType, parsed.data.name, parsed.data.description ?? null]
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error('CREATE_FAILED');
      await client.query('INSERT INTO reusable_block_version (reusable_block_id, version, snapshot_json) VALUES ($1::uuid, 1, $2::jsonb)', [id, JSON.stringify({ ...snapshot, version: 1 })]);
      return { id, version: 1 };
    });
    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42501') return errorResponse(403, 'Reusable block operation is not permitted', 'FORBIDDEN');
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') return errorResponse(409, 'Reusable block version conflict', 'VERSION_CONFLICT');
    if (error instanceof Error && error.message === 'WARD_NOT_FOUND') return errorResponse(404, 'Ward not found', 'NOT_FOUND');
    return errorResponse(500, 'Failed to create reusable block', 'INTERNAL_ERROR');
  }
}
