import { NextResponse } from 'next/server';

import { pool } from '@/src/db/client';
import { APP_VERSION } from '@/src/lib/version';

export async function GET() {
  await pool.query('SELECT 1');

  return NextResponse.json({
    status: 'ok',
    db: 'connected',
    version: APP_VERSION,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown'
  });
}
