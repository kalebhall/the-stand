import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { AuthzError, requirePermission, requireWardRouteAccess, PERMISSIONS } from '@/src/auth/permissions';
import { assignWardRole } from '@/src/db/roles';

const bodySchema = z.object({
  roleName: z.enum([
    'STAND_ADMIN',
    'BISHOPRIC_EDITOR',
    'CLERK_EDITOR',
    'WARD_CLERK',
    'MEMBERSHIP_CLERK',
    'CONDUCTOR_VIEW'
  ])
});

export async function POST(request: Request, context: { params: Promise<{ wardId: string; userId: string }> }) {
  try {
    const session = await auth();
    const params = await context.params;

    requireWardRouteAccess(session, params.wardId);
    requirePermission(session, PERMISSIONS.ASSIGN_WARD_ROLES);

    const body = bodySchema.parse(await request.json());

    await assignWardRole({
      actorUserId: session.user.id,
      wardId: params.wardId,
      targetUserId: params.userId,
      roleName: body.roleName
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
