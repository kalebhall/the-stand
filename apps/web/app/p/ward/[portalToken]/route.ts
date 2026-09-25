import { NextResponse } from 'next/server';
import { pool } from '@/src/db/client';
import { buildPublicProgramEmptyHtml, resolvePublicLocale } from '@/src/i18n/public-program';

type PortalRow = { ward_id: string; default_locale: string | null };
type PublicRenderRow = { render_html: string };
const noIndex = { 'content-type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' };
const notFound = () => NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
function withRobotsMeta(html: string): string {
  const meta = '<meta name="robots" content="noindex,nofollow">';
  const head = html.match(/<head(?:\s[^>]*)?>/i);
  return head ? html.replace(head[0], `${head[0]}${meta}`) : `${meta}${html}`;
}

export async function GET(request: Request, context: { params: Promise<{ portalToken: string }> }) {
  const token = (await context.params).portalToken.trim();
  const cookieLocale = request.headers.get('cookie')?.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)?.[1];
  let locale: string | undefined;
  try { locale = cookieLocale ? decodeURIComponent(cookieLocale) : undefined; } catch { locale = undefined; }

  if (!token) return notFound();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.public_portal_token', token]);
    const portalResult = await client.query('SELECT p.ward_id, w.default_locale FROM public_program_portal p JOIN ward w ON w.id = p.ward_id WHERE p.token = $1::text LIMIT 1', [token]);
    if (!portalResult.rows[0]) { await client.query('ROLLBACK'); return notFound(); }
    const portal = portalResult.rows[0] as PortalRow;
    await client.query('SELECT set_config($1, $2, true)', ['app.ward_id', portal.ward_id]);
    const publicLocale = resolvePublicLocale(locale, portal.default_locale);
    const result = await client.query(`SELECT mpr.render_html FROM meeting m
      JOIN public_program_share pps ON pps.meeting_id = m.id AND pps.ward_id = m.ward_id
      JOIN meeting_program_render mpr ON mpr.id = pps.active_render_id AND mpr.ward_id = pps.ward_id AND mpr.meeting_id = pps.meeting_id
      WHERE m.ward_id = $1::uuid AND m.status = 'PUBLISHED' AND (pps.expires_at IS NULL OR pps.expires_at > now()) AND mpr.published_at IS NOT NULL
      ORDER BY m.meeting_date DESC, m.updated_at DESC LIMIT 1`, [portal.ward_id]);
    await client.query('COMMIT');
    if (!result.rows[0]) return new NextResponse(withRobotsMeta(buildPublicProgramEmptyHtml(publicLocale)), { status: 200, headers: noIndex });
    return new NextResponse(withRobotsMeta((result.rows[0] as PublicRenderRow).render_html), { status: 200, headers: noIndex });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to load ward public portal', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}
