import { NextResponse } from 'next/server';
import { pool } from '@/src/db/client';

type PublicRenderRow = { render_html: string };
const noIndex = { 'content-type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' };
const notFound = () => NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
function withRobotsMeta(html: string): string {
  const meta = '<meta name="robots" content="noindex,nofollow">';
  const head = html.match(/<head(?:\s[^>]*)?>/i);
  return head ? html.replace(head[0], `${head[0]}${meta}`) : `${meta}${html}`;
}

export async function GET(_: Request, context: { params: Promise<{ meetingToken: string }> }) {
  const token = (await context.params).meetingToken.trim();
  if (!token) return notFound();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.public_meeting_token', token]);
    const result = await client.query(`SELECT mpr.render_html
      FROM public_program_share pps JOIN meeting m ON m.id = pps.meeting_id AND m.ward_id = pps.ward_id
      JOIN meeting_program_render mpr ON mpr.id = pps.active_render_id AND mpr.ward_id = pps.ward_id AND mpr.meeting_id = pps.meeting_id
      WHERE pps.token = $1::text AND m.status = 'PUBLISHED' AND (pps.expires_at IS NULL OR pps.expires_at > now()) AND mpr.published_at IS NOT NULL LIMIT 1`, [token]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return notFound(); }
    await client.query('COMMIT');
    return new NextResponse(withRobotsMeta((result.rows[0] as PublicRenderRow).render_html), { status: 200, headers: noIndex });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to load public program', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}
