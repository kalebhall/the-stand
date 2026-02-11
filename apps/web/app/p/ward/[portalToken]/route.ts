import { NextResponse } from 'next/server';

import { pool } from '@/src/db/client';

type PortalRow = {
  ward_id: string;
};

type PublicRenderRow = {
  render_html: string;
};

export async function GET(_: Request, context: { params: Promise<{ portalToken: string }> }) {
  const { portalToken } = await context.params;
  const token = portalToken.trim();

  if (!token) {
    return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.public_portal_token', token]);

    const portalResult = await client.query('SELECT ward_id FROM public_program_portal WHERE token = $1 LIMIT 1', [token]);

    if (!portalResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const portal = portalResult.rows[0] as PortalRow;
    await client.query('SELECT set_config($1, $2, true)', ['app.ward_id', portal.ward_id]);

    const renderResult = await client.query(
      `SELECT mpr.render_html
         FROM meeting m
         JOIN public_program_share pps
           ON pps.meeting_id = m.id
         JOIN meeting_program_render mpr
           ON mpr.meeting_id = m.id
        WHERE m.ward_id = $1
          AND m.status = 'PUBLISHED'
        ORDER BY m.meeting_date DESC, m.updated_at DESC, mpr.version DESC
        LIMIT 1`,
      [portal.ward_id]
    );

    if (!renderResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query('COMMIT');
    const row = renderResult.rows[0] as PublicRenderRow;

    return new NextResponse(row.render_html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load ward public portal', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
