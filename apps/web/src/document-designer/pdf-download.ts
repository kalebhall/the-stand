import { NextResponse } from 'next/server';

export function safePdfFilename(wardName: string, source: 'draft' | 'published', version?: number): string {
  const base = wardName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ward';
  return `${base}-program-${source}${version ? `-v${version}` : ''}.pdf`;
}

export function pdfResponse(bytes: ArrayBuffer | Uint8Array, filename: string): NextResponse {
  const body = bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes;
  return new NextResponse(body as BodyInit, { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
