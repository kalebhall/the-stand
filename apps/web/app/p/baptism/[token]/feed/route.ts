import { NextResponse } from 'next/server';

import { pool } from '@/src/db/client';
import { parseProgramDocument } from '@/src/programs/contracts';
import { baptismProgramPayloadSchema } from '@/src/programs/baptism-adapter';
import { enforceRateLimit } from '@/src/lib/rate-limit';

const notFound = () => NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const token = (await context.params).token;
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return notFound();
  if (!(await enforceRateLimit(`baptism-feed:${token}`, 120))) return NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.public_program_token', token]);
    const result = await client.query(`SELECT p.version, p.published_at, p.program_type, p.source_type, p.source_id, p.expires_at, p.document_json
      FROM program_publication_pointer pointer
      JOIN program_publication p ON p.id = pointer.publication_id
      WHERE pointer.token = $1::text AND p.program_type = 'BAPTISM_PROGRAM' AND p.source_type = 'BAPTISM_EVENT'
        AND p.published_at IS NOT NULL AND (p.expires_at IS NULL OR p.expires_at > now()) LIMIT 1`, [token]);
    const row = result.rows[0] as { version: number; published_at: string; program_type: string; source_type: string; source_id: string; expires_at: string | null; document_json: unknown } | undefined;
    if (!row) { await client.query('ROLLBACK'); return notFound(); }
    const document = parseProgramDocument(row.document_json);
    if (document.programType !== row.program_type || document.source.sourceType !== row.source_type || document.source.sourceId !== row.source_id || document.source.sourceVersion == null) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid public feed snapshot', code: 'INVALID_SNAPSHOT' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
    const payload = baptismProgramPayloadSchema.parse(document.payload);
    const feed = {
      feedVersion: 1,
      publicationVersion: Number(row.version),
      publishedAt: row.published_at,
      programType: 'BAPTISM_PROGRAM' as const,
      title: document.metadata.title,
      date: document.metadata.date,
      location: document.metadata.location ?? null,
      participantDisplayName: payload.participantDisplayName,
      items: payload.items.map(({ key, label, content, sequence }) => ({ key, label, content: content ?? null, sequence }))
    };
    await client.query('COMMIT');
    return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch { await client.query('ROLLBACK').catch(() => undefined); return NextResponse.json({ error: 'Failed to load public feed', code: 'INTERNAL_ERROR' }, { status: 500, headers: { 'Cache-Control': 'no-store' } }); } finally { client.release(); }
}
