import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { loadProgramDocument } from '@/src/programs/persistence';

export async function GET(_: Request, context: { params: Promise<{ wardId: string; programId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, programId } = await context.params;
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const document = await loadProgramDocument(client, { wardId, meetingId: programId });
    await client.query('COMMIT');
    if (!document) return NextResponse.json({ error: 'Program not found', code: 'NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ program: document });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to load program', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
