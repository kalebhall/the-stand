import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!req.auth?.user?.id) {
    if (pathname.startsWith('/api/w/')) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    if (pathname === '/dashboard') {
      return NextResponse.redirect(new URL('/login', req.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/dashboard', '/api/w/:path*']
};
