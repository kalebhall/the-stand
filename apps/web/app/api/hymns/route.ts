import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { pool } from '@/src/db/client';

type HymnRow = {
  id: string;
  hymn_number: string;
  title: string;
  book: string;
  sort_key: number;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const result = await pool.query(
      `SELECT id, hymn_number, title, book, sort_key
         FROM hymn
        WHERE is_active = true
        ORDER BY sort_key ASC`
    );

    return NextResponse.json({
      hymns: (result.rows as HymnRow[]).map((row) => ({
        id: row.id,
        hymnNumber: row.hymn_number,
        title: row.title,
        book: row.book,
        sortKey: row.sort_key
      }))
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch hymns', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
