import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { pool } from '@/src/db/client';

type HymnRow = {
  id: string;
  hymn_number: string;
  title: string;
  book: string;
  sort_key: number;
  locale: string;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!session.activeWardId) {
    return NextResponse.json({ hymns: [], locale: null });
  }

  try {
    const result = await pool.query(
      `SELECT h.id, h.hymn_number, h.title, h.book, h.sort_key, h.locale
         FROM hymn h
         JOIN ward w ON w.default_locale = h.locale
        WHERE h.is_active = true
          AND w.id = $1::uuid
        ORDER BY h.sort_key ASC`,
      [session.activeWardId]
    );

    return NextResponse.json({
      hymns: (result.rows as HymnRow[]).map((row) => ({
        id: row.id,
        hymnNumber: row.hymn_number,
        title: row.title,
        book: row.book,
        sortKey: row.sort_key,
        locale: row.locale
      })),
      locale: result.rows[0]?.locale ?? null
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch hymns', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
