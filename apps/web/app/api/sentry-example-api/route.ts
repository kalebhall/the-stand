import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    message: 'Sentry example API placeholder. Use your own monitored routes instead.'
  });
}
