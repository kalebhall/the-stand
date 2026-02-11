import { NextResponse } from 'next/server';

import { healthResponseSchema } from '@the-stand/shared';

import { pool } from '@/src/db/client';
import { APP_VERSION } from '@/src/lib/version';

export async function GET() {
  await pool.query('SELECT 1');

  const body = healthResponseSchema.parse({
    status: 'ok',
    db: 'connected',
    version: APP_VERSION
  });

  return NextResponse.json(body);
}
