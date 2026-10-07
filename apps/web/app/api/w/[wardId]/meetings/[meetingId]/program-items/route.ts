import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner, canUseInternalNotes } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled, isWardModuleEnabledInTransaction } from '@/src/modules/service';
import { readProgramItems } from '@/src/meetings/program-item-service';
import { toProgramItemsResponse } from '@/src/meetings/program-item-source';

function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId))
    return errorResponse('Forbidden', 'FORBIDDEN', 403);
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const includeInternalNotes = canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return errorResponse('Forbidden', 'FORBIDDEN', 403);
    }
    const contextData = await readProgramItems(client, wardId, meetingId, false, { includeInternalNotes });
    if (!contextData) {
      await client.query('ROLLBACK');
      return errorResponse('Meeting not found', 'NOT_FOUND', 404);
    }
    await client.query('COMMIT');
    return NextResponse.json(toProgramItemsResponse(contextData.meeting, contextData.rows, { includeInternalNotes }), {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to load program entries', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
}
