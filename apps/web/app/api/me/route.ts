import { NextResponse } from 'next/server';

import { meResponseSchema } from '@the-stand/shared';

import { auth } from '@/src/auth/auth';
import { ensureSupportAdminBootstrap } from '@/src/db/bootstrap-support-admin';

export async function GET() {
  await ensureSupportAdminBootstrap();

  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = meResponseSchema.parse({
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.name ?? null
    },
    activeWardId: session.activeWardId,
    roles: session.user.roles
  });

  return NextResponse.json(body);
}
