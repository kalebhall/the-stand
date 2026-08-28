import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { markAllUserNotificationsRead } from '@/src/notifications/user-notifications';

export async function POST(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const { wardId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const markedCount = await markAllUserNotificationsRead(client, {
      wardId,
      recipientUserId: session.user.id
    });
    await client.query('COMMIT');
    return NextResponse.json({ success: true, markedCount });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('user_notifications_mark_all_read_failed', { wardId, error });
    return NextResponse.json({ error: 'Failed to mark notifications read', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
