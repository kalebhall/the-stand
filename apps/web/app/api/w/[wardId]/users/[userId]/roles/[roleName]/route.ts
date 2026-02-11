import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { AuthzError, requirePermission, requireWardRouteAccess, PERMISSIONS } from '@/src/auth/permissions';
import { revokeWardRole } from '@/src/db/roles';

const paramsSchema = z.object({
  wardId: z.string().uuid(),
  userId: z.string().uuid(),
  roleName: z.enum([
    'STAND_ADMIN',
    'BISHOPRIC_EDITOR',
    'CLERK_EDITOR',
    'WARD_CLERK',
    'MEMBERSHIP_CLERK',
    'CONDUCTOR_VIEW'
  ])
});

export async function DELETE(_request: Request, context: { params: Promise<{ wardId: string; userId: string; roleName: string }> }) {
  try {
    const session = await auth();
    const parsed = paramsSchema.parse(await context.params);

    requireWardRouteAccess(session, parsed.wardId);
    requirePermission(session, PERMISSIONS.REVOKE_WARD_ROLES);

    await revokeWardRole({
      actorUserId: session.user.id,
      wardId: parsed.wardId,
      targetUserId: parsed.userId,
      roleName: parsed.roleName
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid route parameters', code: 'BAD_REQUEST' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
