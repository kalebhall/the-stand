import { pool } from './client';
import { logAuditAction } from './audit';
import { ALL_ROLE_SEEDS, type RoleName } from '../auth/permissions';

export async function ensureRoleSeeds(): Promise<void> {
  for (const role of ALL_ROLE_SEEDS) {
    await pool.query(
      `INSERT INTO role (name, scope)
       VALUES ($1, $2)
       ON CONFLICT (name)
       DO UPDATE SET scope = EXCLUDED.scope`,
      [role.name, role.scope]
    );
  }
}

function assertWardRole(roleName: RoleName): void {
  const seed = ALL_ROLE_SEEDS.find((entry) => entry.name === roleName);
  if (!seed || seed.scope !== 'WARD') {
    throw new Error('Only ward-scoped roles may be assigned from ward context.');
  }
}

export async function assignWardRole(input: {
  actorUserId: string;
  wardId: string;
  targetUserId: string;
  roleName: RoleName;
}): Promise<void> {
  assertWardRole(input.roleName);

  await pool.query(
    `INSERT INTO ward_user_role (ward_id, user_id, role_id)
     VALUES ($1, $2, (SELECT id FROM role WHERE name = $3))
     ON CONFLICT DO NOTHING`,
    [input.wardId, input.targetUserId, input.roleName]
  );

  await logAuditAction({
    action: 'WARD_ROLE_ASSIGNED',
    actorUserId: input.actorUserId,
    wardId: input.wardId,
    details: {
      targetUserId: input.targetUserId,
      roleName: input.roleName
    }
  });
}

export async function revokeWardRole(input: {
  actorUserId: string;
  wardId: string;
  targetUserId: string;
  roleName: RoleName;
}): Promise<void> {
  assertWardRole(input.roleName);

  await pool.query(
    `DELETE FROM ward_user_role
      WHERE ward_id = $1
        AND user_id = $2
        AND role_id = (SELECT id FROM role WHERE name = $3)`,
    [input.wardId, input.targetUserId, input.roleName]
  );

  await logAuditAction({
    action: 'WARD_ROLE_REVOKED',
    actorUserId: input.actorUserId,
    wardId: input.wardId,
    details: {
      targetUserId: input.targetUserId,
      roleName: input.roleName
    }
  });
}
