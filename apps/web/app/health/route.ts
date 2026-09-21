import { NextResponse } from 'next/server';

import { pool } from '@/src/db/client';

export async function GET() {
  try {
    await pool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch (error) {
    console.error('api_health_check_failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return NextResponse.json({ status: 'degraded', db: 'disconnected' }, { status: 503 });
  }
}
