import { NextResponse } from 'next/server';
import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { getActivePublication, listPublicationHistory } from '@/src/document-designer/publication-history';

const errorResponse = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const meeting = await client.query('SELECT id FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [meetingId, wardId]);
    if (!meeting.rows[0]) { await client.query('ROLLBACK'); return errorResponse('Meeting not found', 'NOT_FOUND', 404); }
    const history = await listPublicationHistory(client, { wardId, meetingId });
    const active = await getActivePublication(client, { wardId, meetingId });
    await client.query('COMMIT');
    return NextResponse.json({ active, history });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to load publication history', 'INTERNAL_ERROR', 500);
  } finally { client.release(); }
}
