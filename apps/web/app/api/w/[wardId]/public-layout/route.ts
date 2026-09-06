import { NextResponse } from 'next/server';

import { buildFieldDiff, recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { validatePublicLayout } from '@/src/meetings/public-layout';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

type LayoutRow = {
  preset: string;
  announcement_mode: string;
  cover_mode: string;
  cover_image_url: string | null;
  cover_image_alt_text: string | null;
};

function getAccess(wardId: string) {
  return auth().then((session) => {
    if (!session?.user?.id) return { response: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }) };
    if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return { response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
    return { session };
  });
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await getAccess(wardId);
  if (access.response) return access.response;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: access.session.user.id, wardId });
    const result = await client.query('SELECT preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1', [wardId]);
    await client.query('COMMIT');
    return NextResponse.json({ layout: result.rows[0] ?? { preset: 'SINGLE_SHEET_BIFOLD', announcement_mode: 'AFTER_PROGRAM', cover_mode: 'NONE', cover_image_url: null, cover_image_alt_text: null } });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load public layout', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await getAccess(wardId);
  if (access.response) return access.response;
  const body = await request.json().catch(() => null) as { preset?: string; announcementMode?: string; coverMode?: string; coverImageUrl?: string; coverImageAltText?: string } | null;
  const preset = text(body?.preset);
  const announcementMode = text(body?.announcementMode);
  const coverMode = text(body?.coverMode);
  const coverImageUrl = text(body?.coverImageUrl);
  const coverImageAltText = text(body?.coverImageAltText);
  const error = validatePublicLayout({ preset, announcementMode, coverMode, coverImageUrl, coverImageAltText });
  if (error) return NextResponse.json({ error, code: 'BAD_REQUEST' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: access.session.user.id, wardId });
    const beforeResult = await client.query('SELECT preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1', [wardId]);
    const before = beforeResult.rows[0] as LayoutRow | undefined;
    const after = { preset, announcement_mode: announcementMode, cover_mode: coverMode, cover_image_url: coverImageUrl || null, cover_image_alt_text: coverImageAltText || null };
    const result = await client.query(`INSERT INTO public_program_layout (ward_id, preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text, updated_by_user_id) VALUES ($1::uuid, $2::text, $3::text, $4::text, NULLIF($5::text, ''), NULLIF($6::text, ''), $7::uuid) ON CONFLICT (ward_id) DO UPDATE SET preset = EXCLUDED.preset, announcement_mode = EXCLUDED.announcement_mode, cover_mode = EXCLUDED.cover_mode, cover_image_url = EXCLUDED.cover_image_url, cover_image_alt_text = EXCLUDED.cover_image_alt_text, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now() RETURNING preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text`, [wardId, preset, announcementMode, coverMode, coverImageUrl, coverImageAltText, access.session.user.id]);
    const changes = buildFieldDiff(before ? { ...before } : null, after, []);
    if (changes) {
      await recordAuditEvent(client, {
        wardId,
        userId: access.session.user.id,
        actorName: access.session.user.name || access.session.user.email || null,
        actorRole: access.session.user.roles?.[0] || null,
        action: 'PUBLIC_LAYOUT_UPDATED',
        entityType: 'ward_setting',
        entityId: wardId,
        changes,
        previousState: before ? { ...before } : null,
        details: { setting: 'public_program_layout' },
        source: 'manual_ui',
        severity: 'notice'
      });
    }
    await client.query('COMMIT');
    return NextResponse.json({ layout: result.rows[0] });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to save public layout', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
