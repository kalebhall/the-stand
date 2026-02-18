import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

const VALID_UNIT_TYPES = ['ward', 'stake', 'branch', 'district'] as const;
type UnitType = (typeof VALID_UNIT_TYPES)[number];

function canManageStandardCallings(roles: string[] | undefined): boolean {
  return (
    hasRole(roles, 'SUPPORT_ADMIN') ||
    hasRole(roles, 'STAND_ADMIN') ||
    hasRole(roles, 'BISHOPRIC_EDITOR') ||
    hasRole(roles, 'CLERK_EDITOR')
  );
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!canManageStandardCallings(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await context.params;

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    organization?: string;
    unitType?: string;
    sortOrder?: number;
    isActive?: boolean;
  } | null;

  const name = body?.name?.trim() ?? '';
  const organization = body?.organization?.trim() ?? null;
  const unitType = body?.unitType?.trim() ?? '';
  const sortOrder = typeof body?.sortOrder === 'number' ? body.sortOrder : 0;
  const isActive = typeof body?.isActive === 'boolean' ? body.isActive : true;

  if (!name || !VALID_UNIT_TYPES.includes(unitType as UnitType)) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `UPDATE standard_calling
          SET name         = $1,
              organization = $2,
              unit_type    = $3,
              sort_order   = $4,
              is_active    = $5,
              updated_at   = now()
        WHERE id = $6
       RETURNING id`,
      [name, organization || null, unitType, sortOrder, isActive, id]
    );

    if (!result.rowCount) {
      return NextResponse.json({ error: 'Standard calling not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ id });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'A calling with that name already exists', code: 'DUPLICATE' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to update standard calling', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!canManageStandardCallings(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const result = await pool.query(`DELETE FROM standard_calling WHERE id = $1 RETURNING id`, [id]);

    if (!result.rowCount) {
      return NextResponse.json({ error: 'Standard calling not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: 'Failed to delete standard calling', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
