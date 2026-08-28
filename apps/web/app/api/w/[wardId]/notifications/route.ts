import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { NOTIFICATION_CATEGORIES } from '@/src/notifications/events';
import { listUserNotifications, countUnreadUserNotifications } from '@/src/notifications/user-notifications';

const filterSchema = z.enum(['all', 'unread']);
const categorySchema = z.enum(NOTIFICATION_CATEGORIES);

type AuthorizationResult = { userId: string } | { response: NextResponse };

async function authorize(wardId: string): Promise<AuthorizationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }) };
  }
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return { response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const authorization = await authorize(wardId);
  if ('response' in authorization) return authorization.response;

  const searchParams = new URL(request.url).searchParams;
  const filterResult = filterSchema.optional().safeParse(searchParams.get('filter') ?? undefined);
  const categoryResult = categorySchema.optional().safeParse(searchParams.get('category') ?? undefined);
  const rawLimit = searchParams.get('limit');
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (!filterResult.success || !categoryResult.success || (rawLimit !== null && (!Number.isFinite(limit) || !Number.isInteger(limit)))) {
    return NextResponse.json({ error: 'Invalid notification query', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: authorization.userId, wardId });
    const notifications = await listUserNotifications(client, {
      wardId,
      recipientUserId: authorization.userId,
      filter: filterResult.data,
      category: categoryResult.data,
      limit
    });
    const unreadCount = await countUnreadUserNotifications(client, {
      wardId,
      recipientUserId: authorization.userId
    });
    await client.query('COMMIT');
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('user_notifications_get_failed', { wardId, error });
    return NextResponse.json({ error: 'Failed to load notifications', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
