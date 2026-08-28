import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { dismissUserNotification, markUserNotificationRead } from '@/src/notifications/user-notifications';

const actionSchema = z.object({ action: z.enum(['read', 'dismiss']) });
const paramsSchema = z.object({ wardId: z.string().uuid(), notificationId: z.string().uuid() });

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; notificationId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: 'Invalid notification path', code: 'VALIDATION_ERROR' }, { status: 400 });
  }
  const { wardId, notificationId } = params.data;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid notification action', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const changed = parsed.data.action === 'read'
      ? await markUserNotificationRead(client, { wardId, recipientUserId: session.user.id, notificationId })
      : await dismissUserNotification(client, { wardId, recipientUserId: session.user.id, notificationId });
    await client.query('COMMIT');
    if (!changed) {
      return NextResponse.json({ error: 'Notification not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('user_notification_patch_failed', { wardId, notificationId, error });
    return NextResponse.json({ error: 'Failed to update notification', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
