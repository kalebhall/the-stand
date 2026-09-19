import { NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/src/db/client';
import { enforceRateLimit } from '@/src/lib/rate-limit';
import { enqueueGlobalNotificationEvent } from '@/src/notifications/global-outbox';
import { enqueueGlobalNotificationJob } from '@/src/notifications/queue';

const accessRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  stake: z.string().trim().min(1).max(160),
  ward: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
  website: z.string().optional()
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown-ip';
  if (!enforceRateLimit(`public:access-requests:${ip}`, 10)) {
    return NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = accessRequestSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request payload', code: 'BAD_REQUEST' }, { status: 400 });
  }

  if ((parsed.data.website ?? '').trim()) {
    return NextResponse.json({ success: true });
  }

  const { name, email, stake, ward, message } = parsed.data;

  const result = await pool.query(
    `WITH inserted_request AS (
       INSERT INTO access_request (name, email, stake, ward, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id
     ), inserted_work_item AS (
       INSERT INTO support_work_item (source_type, source_id)
       SELECT 'ACCESS_REQUEST', id
         FROM inserted_request
       ON CONFLICT (source_type, source_id) DO NOTHING
       RETURNING id, source_id
     ), inserted_event AS (
       INSERT INTO global_event_outbox (aggregate_type, aggregate_id, event_type, payload)
       SELECT 'SUPPORT_WORK_ITEM', id, 'SUPPORT_REQUEST_CREATED',
              jsonb_build_object('sourceType', 'ACCESS_REQUEST', 'sourceId', source_id::text)
         FROM inserted_work_item
       ON CONFLICT (event_type, aggregate_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'
       RETURNING id
     )
     SELECT id AS request_id, (SELECT id FROM inserted_event) AS global_event_id
       FROM inserted_request`,
    [name, email.toLowerCase(), stake, ward, message]
  );

  const globalEventOutboxId = result.rows[0]?.global_event_id as string | null | undefined;
  enqueueGlobalNotificationEvent(enqueueGlobalNotificationJob, globalEventOutboxId ?? null);

  return NextResponse.json({ success: true }, { status: 201 });
}
