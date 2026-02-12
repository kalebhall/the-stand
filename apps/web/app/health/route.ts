import { NextResponse } from 'next/server';

import { pool } from '@/src/db/client';

export async function GET() {
  await pool.query('SELECT 1');

  return NextResponse.json({ status: 'ok', db: 'connected' });
}
