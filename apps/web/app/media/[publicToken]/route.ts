import { NextResponse } from 'next/server';
import { pool } from '@/src/db/client';
import { loadMediaForPublicToken } from '@/src/document-designer/media-service';
import { readMedia } from '@/src/document-designer/media-storage';

export async function GET(_: Request, context: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicToken)) return new NextResponse(null, { status: 404 });
  let client: Awaited<ReturnType<typeof pool.connect>> | undefined;
  try {
    client = await pool.connect();
    const asset = await loadMediaForPublicToken(client, publicToken);
    if (!asset || (asset.is_decorative === false && !asset.alt_text)) return new NextResponse(null, { status: 404 });
    const body = await readMedia(asset.storage_key).catch(() => null);
    if (!body) return new NextResponse(null, { status: 404 });
    return new NextResponse(body as unknown as BodyInit, { status: 200, headers: { 'Content-Type': asset.mime_type, 'Content-Length': String(body.byteLength), 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error('[media-public] delivery failed', error);
    return new NextResponse(null, { status: 404 });
  } finally {
    client?.release();
  }
}
