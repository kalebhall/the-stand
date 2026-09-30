import { NextResponse } from 'next/server';
import { pool } from '@/src/db/client';

const headers = { 'content-type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const token = (await context.params).token.trim();
  if (!token) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.public_program_token', token]);
    const result = await client.query(`SELECT p.render_html
      FROM program_publication_pointer pointer
      JOIN program_publication p ON p.id = pointer.publication_id
      WHERE pointer.token = $1::text AND p.program_type = 'BAPTISM_PROGRAM' AND p.source_type = 'BAPTISM_EVENT'
        AND p.published_at IS NOT NULL AND (p.expires_at IS NULL OR p.expires_at > now()) LIMIT 1`, [token]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 }); }
    await client.query('COMMIT');
    return new NextResponse(result.rows[0].render_html as string, { headers });
  } catch { await client.query('ROLLBACK').catch(() => undefined); return NextResponse.json({ error: 'Failed to load public program', code: 'INTERNAL_ERROR' }, { status: 500 }); } finally { client.release(); }
}
