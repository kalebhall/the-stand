import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { pool } from '@/src/db/client';
import { isSupportedLocale, type Locale } from '@/src/i18n/config';

const updateLocaleSchema = z.object({
  locale: z.string().refine(isSupportedLocale, 'Unsupported locale')
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const result = await pool.query('SELECT preferred_locale FROM user_account WHERE id = $1::uuid AND is_active = true LIMIT 1', [
      session.user.id
    ]);
    const preferredLocale = result.rows[0]?.preferred_locale;

    return NextResponse.json({ locale: isSupportedLocale(preferredLocale) ? preferredLocale : null });
  } catch (error) {
    console.error('account_preference_get_failed', error);
    return NextResponse.json({ error: 'Failed to load account preferences', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_REQUEST_BODY' }, { status: 400 });
  }

  const parsed = updateLocaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unsupported locale', code: 'INVALID_LOCALE' }, { status: 400 });
  }

  const locale: Locale = parsed.data.locale;
  let result;
  try {
    result = await pool.query(
      `UPDATE user_account
          SET preferred_locale = $1::text
        WHERE id = $2::uuid
          AND is_active = true
        RETURNING preferred_locale`,
      [locale, session.user.id]
    );
  } catch (error) {
    console.error('account_preference_patch_failed', error);
    return NextResponse.json({ error: 'Failed to save account preferences', code: 'INTERNAL_ERROR' }, { status: 500 });
  }

  if (!result.rowCount) {
    return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 });
  }

  const response = NextResponse.json({ locale: result.rows[0].preferred_locale });
  response.cookies.set('NEXT_LOCALE', locale, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax'
  });
  return response;
}
