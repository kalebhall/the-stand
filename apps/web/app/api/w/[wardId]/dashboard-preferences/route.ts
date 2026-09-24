import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/platform/db/context';
import { DASHBOARD_CARD_IDS, normalizeDashboardCardOrder } from '@/src/dashboard/catalog';

const cardOrderSchema = z.object({ cardOrder: z.array(z.string()).max(DASHBOARD_CARD_IDS.length) });

function accessDenied(status: 401 | 403) {
  return NextResponse.json(
    { error: status === 401 ? 'Unauthorized' : 'Forbidden', code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' },
    { status }
  );
}

async function getAccess(wardId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: accessDenied(401) };
  if (session.activeWardId !== wardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return { response: accessDenied(403) };
  }
  return { session };
}

async function withPreferenceClient<T>(wardId: string, userId: string, operation: (client: Awaited<ReturnType<typeof pool.connect>>) => Promise<T>): Promise<T> {
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
  const access = await getAccess(wardId);
  if (access.response) return access.response;

  try {
    const cardOrder = await withPreferenceClient(wardId, access.session.user.id, async (client) => {
      const result = await client.query('SELECT card_order FROM dashboard_layout_preference WHERE ward_id = $1::uuid AND user_id = $2::uuid LIMIT 1', [wardId, access.session.user.id]);
      return normalizeDashboardCardOrder(result.rows[0]?.card_order) ?? [...DASHBOARD_CARD_IDS];
    });
    return NextResponse.json({ cardOrder });
  } catch {
    return NextResponse.json({ error: 'Failed to load dashboard preferences', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await getAccess(wardId);
  if (access.response) return access.response;

  const parsed = cardOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'cardOrder must be an array of card IDs', code: 'BAD_REQUEST' }, { status: 400 });
  const cardOrder = normalizeDashboardCardOrder(parsed.data.cardOrder);
  if (!cardOrder || parsed.data.cardOrder.some((id) => !DASHBOARD_CARD_IDS.includes(id as (typeof DASHBOARD_CARD_IDS)[number]))) {
    return NextResponse.json({ error: 'cardOrder contains an unknown or duplicate card ID', code: 'BAD_REQUEST' }, { status: 400 });
  }

  try {
    await withPreferenceClient(wardId, access.session.user.id, (client) =>
      client.query(
        `INSERT INTO dashboard_layout_preference (ward_id, user_id, card_order, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::jsonb, now())
         ON CONFLICT (ward_id, user_id) DO UPDATE
           SET card_order = EXCLUDED.card_order, updated_at = now()`,
        [wardId, access.session.user.id, JSON.stringify(cardOrder)]
      )
    );
    return NextResponse.json({ cardOrder });
  } catch {
    return NextResponse.json({ error: 'Failed to save dashboard preferences', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await getAccess(wardId);
  if (access.response) return access.response;

  try {
    await withPreferenceClient(wardId, access.session.user.id, (client) =>
      client.query('DELETE FROM dashboard_layout_preference WHERE ward_id = $1::uuid AND user_id = $2::uuid', [wardId, access.session.user.id])
    );
    return NextResponse.json({ cardOrder: [...DASHBOARD_CARD_IDS] });
  } catch {
    return NextResponse.json({ error: 'Failed to reset dashboard preferences', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
