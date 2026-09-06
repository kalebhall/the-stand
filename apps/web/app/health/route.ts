import { NextResponse } from 'next/server';

import { pool, resetDatabasePool } from '@/src/db/client';
import { withDatabaseRecovery } from '@/src/db/recovery';

export async function GET() {
  await withDatabaseRecovery(() => pool.query('SELECT 1'), resetDatabasePool);

  return NextResponse.json({ status: 'ok', db: 'connected' });
}
