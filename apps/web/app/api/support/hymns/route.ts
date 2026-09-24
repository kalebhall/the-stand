import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { isSupportedCatalogLocale } from '@/src/i18n/config';

const VALID_BOOKS = ['STANDARD', 'NEW', 'CHILDRENS'] as const;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    hymnNumber?: string;
    title?: string;
    locale?: string;
    book?: string;
    sortKey?: number;
  } | null;

  const hymnNumber = body?.hymnNumber?.trim() ?? '';
  const title = body?.title?.trim() ?? '';
  const locale = body?.locale?.trim() ?? '';
  const book = body?.book?.trim() ?? '';
  const sortKey = typeof body?.sortKey === 'number' ? body.sortKey : null;

  if (!hymnNumber || !title || !isSupportedCatalogLocale(locale) || !VALID_BOOKS.includes(book as (typeof VALID_BOOKS)[number]) || sortKey === null) {
    return NextResponse.json({ error: 'Invalid hymn payload', code: 'BAD_REQUEST' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `INSERT INTO hymn (locale, hymn_number, title, book, sort_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [locale, hymnNumber, title, book, sortKey]
    );

    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create hymn', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
