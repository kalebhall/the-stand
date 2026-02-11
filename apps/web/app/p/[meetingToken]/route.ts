import { NextResponse } from 'next/server';

import { pool } from '@/src/db/client';

type PublicRenderRow = {
  render_html: string;
};

export async function GET(_: Request, context: { params: Promise<{ meetingToken: string }> }) {
  const { meetingToken } = await context.params;
  const token = meetingToken.trim();

  if (!token) {
    return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.public_meeting_token', token]);

    const renderResult = await client.query(
      `SELECT mpr.render_html
         FROM public_program_share pps
         JOIN meeting m
           ON m.id = pps.meeting_id
         JOIN meeting_program_render mpr
           ON mpr.meeting_id = m.id
        WHERE pps.token = $1
          AND m.status = 'PUBLISHED'
        ORDER BY mpr.version DESC
        LIMIT 1`,
      [token]
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
    return NextResponse.json({ error: 'Failed to load public program', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
