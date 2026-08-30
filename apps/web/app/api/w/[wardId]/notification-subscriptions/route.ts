import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import {
  NOTIFICATION_EMAIL_FREQUENCIES,
  getNotificationEmailPreference,
  isValidIanaTimeZone,
  updateNotificationEmailPreference
} from '@/src/notifications/email-preferences';
import { NOTIFICATION_EVENT_TYPES } from '@/src/notifications/events';
import { getNotificationSubscriptions, updateNotificationSubscriptions } from '@/src/notifications/subscriptions';

const subscriptionUpdateSchema = z.object({
  eventType: z.enum(NOTIFICATION_EVENT_TYPES),
  channel: z.enum(['IN_APP', 'EMAIL']),
  enabled: z.boolean()
});

const notificationEmailPreferenceSchema = z.object({
  frequency: z.enum(NOTIFICATION_EMAIL_FREQUENCIES),
  timezone: z.string().trim().min(1, 'Timezone is required.').refine(isValidIanaTimeZone, 'Timezone must be a valid IANA timezone.')
});

const notificationTimezoneSchema = z.object({
  timezone: z.string().trim().min(1, 'Timezone is required.').refine(isValidIanaTimeZone, 'Timezone must be a valid IANA timezone.')
});

const updateSubscriptionsSchema = z.object({
  subscriptions: z.array(subscriptionUpdateSchema).min(1).max(200),
  emailPreference: notificationEmailPreferenceSchema
});

type AuthorizedSession = {
  user: { id: string; roles?: string[] };
  activeWardId?: string | null;
};

type AuthorizationResult = { session: AuthorizedSession } | { response: NextResponse };

async function getAuthorizedSession(wardId: string): Promise<AuthorizationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }) };
  }
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return { response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
  }
  return {
    session: {
      user: { id: session.user.id, roles: session.user.roles },
      activeWardId: session.activeWardId
    }
  };
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const authorization = await getAuthorizedSession(wardId);
  if ('response' in authorization) return authorization.response;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: authorization.session.user.id, wardId });
    const [subscriptions, emailPreference] = await Promise.all([
      getNotificationSubscriptions(client, { wardId, userId: authorization.session.user.id }),
      getNotificationEmailPreference(client, { wardId, userId: authorization.session.user.id })
    ]);
    await client.query('COMMIT');
    return NextResponse.json({ subscriptions, emailPreference });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('notification_subscription_get_failed', { wardId, error });
    return NextResponse.json({ error: 'Failed to load notification subscriptions', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const authorization = await getAuthorizedSession(wardId);
  if ('response' in authorization) return authorization.response;

  const parsed = updateSubscriptionsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid notification subscription payload', code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: authorization.session.user.id, wardId });
    const [subscriptions, emailPreference] = await Promise.all([
      updateNotificationSubscriptions(client, {
        wardId,
        userId: authorization.session.user.id,
        updates: parsed.data.subscriptions
      }),
      updateNotificationEmailPreference(client, {
        wardId,
        userId: authorization.session.user.id,
        frequency: parsed.data.emailPreference.frequency,
        timezone: parsed.data.emailPreference.timezone
      })
    ]);
    await client.query('COMMIT');
    return NextResponse.json({ subscriptions, emailPreference });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('notification_subscription_put_failed', { wardId, error });
    return NextResponse.json({ error: 'Failed to save notification subscriptions', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const authorization = await getAuthorizedSession(wardId);
  if ('response' in authorization) return authorization.response;

  const parsed = notificationTimezoneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid notification timezone payload', code: 'VALIDATION_ERROR', detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: authorization.session.user.id, wardId });
    const currentPreference = await getNotificationEmailPreference(client, { wardId, userId: authorization.session.user.id });
    const emailPreference = await updateNotificationEmailPreference(client, {
      wardId,
      userId: authorization.session.user.id,
      frequency: currentPreference.frequency,
      timezone: parsed.data.timezone
    });
    await client.query('COMMIT');
    return NextResponse.json({ emailPreference });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('notification_timezone_patch_failed', { wardId, error });
    return NextResponse.json({ error: 'Failed to save notification timezone', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
