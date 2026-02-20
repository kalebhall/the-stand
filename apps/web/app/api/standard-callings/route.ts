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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, organization, unit_type, sort_order, is_active, created_at, updated_at
         FROM standard_calling
        ORDER BY unit_type, sort_order, name`
    );

    return NextResponse.json({
      callings: result.rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        organization: row.organization as string | null,
        unitType: row.unit_type as UnitType,
        sortOrder: row.sort_order as number,
        isActive: row.is_active as boolean,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string
      }))
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load standard callings', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!canManageStandardCallings(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    organization?: string;
    unitType?: string;
    sortOrder?: number;
  } | null;

  const name = body?.name?.trim() ?? '';
  const organization = body?.organization?.trim() ?? null;
  const unitType = body?.unitType?.trim() ?? '';
  const sortOrder = typeof body?.sortOrder === 'number' ? body.sortOrder : 0;

  if (!name || !VALID_UNIT_TYPES.includes(unitType as UnitType)) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `INSERT INTO standard_calling (name, organization, unit_type, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name, organization || null, unitType, sortOrder]
    );

    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return NextResponse.json({ error: 'A calling with that name already exists', code: 'DUPLICATE' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to create standard calling', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
