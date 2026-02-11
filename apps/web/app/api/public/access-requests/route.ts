import { NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/src/db/client';
import { enforceRateLimit } from '@/src/lib/rate-limit';

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

  await pool.query(
    `INSERT INTO access_request (name, email, stake, ward, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [name, email.toLowerCase(), stake, ward, message]
  );

  return NextResponse.json({ success: true }, { status: 201 });
}
