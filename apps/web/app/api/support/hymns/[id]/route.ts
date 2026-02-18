import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

const VALID_BOOKS = ['STANDARD', 'NEW', 'CHILDRENS'] as const;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await context.params;

  const body = (await request.json().catch(() => null)) as {
    hymnNumber?: string;
    title?: string;
    book?: string;
    sortKey?: number;
    isActive?: boolean;
  } | null;

  const hymnNumber = body?.hymnNumber?.trim() ?? '';
  const title = body?.title?.trim() ?? '';
  const book = body?.book?.trim() ?? '';
  const sortKey = typeof body?.sortKey === 'number' ? body.sortKey : null;
  const isActive = typeof body?.isActive === 'boolean' ? body.isActive : null;

  if (!hymnNumber || !title || !VALID_BOOKS.includes(book as (typeof VALID_BOOKS)[number]) || sortKey === null || isActive === null) {
    return NextResponse.json({ error: 'Invalid hymn payload', code: 'BAD_REQUEST' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `UPDATE hymn
          SET hymn_number = $1,
              title       = $2,
              book        = $3,
              sort_key    = $4,
              is_active   = $5,
              updated_at  = now()
        WHERE id = $6
       RETURNING id`,
      [hymnNumber, title, book, sortKey, isActive, id]
    );

    if (!result.rowCount) {
      return NextResponse.json({ error: 'Hymn not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: 'Failed to update hymn', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const result = await pool.query(`DELETE FROM hymn WHERE id = $1 RETURNING id`, [id]);

    if (!result.rowCount) {
      return NextResponse.json({ error: 'Hymn not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: 'Failed to delete hymn', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
