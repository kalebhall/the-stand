import { NextResponse } from 'next/server';

import { pool } from '@/src/db/client';
import { APP_VERSION } from '@/src/lib/version';

export async function GET() {
  try {
    await pool.query('SELECT 1');
  } catch (firstError) {
    // A stale idle TCP connection can fail once after a long-lived dev/test session.
    // The pool error handler retires that pool; retry against the replacement pool.
    console.warn('[health] retrying database probe after connection failure', { error: firstError });
    await pool.query('SELECT 1');
  }

  return NextResponse.json({
    status: 'ok',
    db: 'connected',
    version: APP_VERSION,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown'
  });
}
