'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';
import { hashPassword } from '@/src/auth/password';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

async function requireSupportAdmin() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    redirect('/dashboard');
  }

  return session;
}

export async function createUser(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const displayNameRaw = String(formData.get('displayName') ?? '').trim();
  const displayName = displayNameRaw.length ? displayNameRaw : null;
  const password = String(formData.get('password') ?? '').trim();
  const googleOnly = formData.get('googleOnly') === '1';

  if (!email) {
    return;
  }

  if (!googleOnly && password.length < 12) {
    return;
  }

  const passwordHash = googleOnly ? null : await hashPassword(password);

  const inserted = await pool.query(
    `INSERT INTO user_account (email, display_name, password_hash, must_change_password)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email)
     DO NOTHING
     RETURNING id, email`,
    [email, displayName, passwordHash, !googleOnly]
  );

  if (!inserted.rowCount) {
    return;
  }

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_USER_CREATED', jsonb_build_object('targetUserId', $2::text, 'email', $3::text, 'hasPassword', $4::boolean, 'googleOnly', $5::boolean))`,
    [actingSession.user.id, inserted.rows[0].id as string, inserted.rows[0].email as string, !googleOnly, googleOnly]
  );

  revalidatePath('/support/users');
}

export async function updateUser(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const displayNameRaw = String(formData.get('displayName') ?? '').trim();
  const displayName = displayNameRaw.length ? displayNameRaw : null;

  if (!userId || !email) {
    return;
  }

  await pool.query(`UPDATE user_account SET email = $1, display_name = $2 WHERE id = $3`, [email, displayName, userId]);

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_USER_UPDATED', jsonb_build_object('targetUserId', $2::text, 'email', $3::text, 'displayName', $4::text))`,
    [actingSession.user.id, userId, email, displayName]
  );

  revalidatePath('/support/users');
}

export async function deleteUser(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');

  if (!userId || userId === actingSession.user.id) {
    return;
  }

  const deleted = await pool.query(`DELETE FROM user_account WHERE id = $1 RETURNING id, email`, [userId]);

  if (!deleted.rowCount) {
    return;
  }

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_USER_DELETED', jsonb_build_object('targetUserId', $2::text, 'email', $3::text))`,
    [actingSession.user.id, deleted.rows[0].id as string, deleted.rows[0].email as string]
  );

  revalidatePath('/support/users');
}

export async function setUserActivation(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');
  const nextState = String(formData.get('nextState') ?? '');

  if (!userId || (nextState !== 'ACTIVE' && nextState !== 'INACTIVE')) {
    return;
  }

  const isActive = nextState === 'ACTIVE';

  await pool.query(`UPDATE user_account SET is_active = $1 WHERE id = $2`, [isActive, userId]);

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_USER_STATUS_UPDATED', jsonb_build_object('targetUserId', $2, 'isActive', $3::boolean))`,
    [actingSession.user.id, userId, isActive]
  );

  revalidatePath('/support/users');
}

export async function assignGlobalRole(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');

  if (!userId || !roleId) {
    return;
  }

  const roleResult = await pool.query(`SELECT name, scope FROM role WHERE id = $1 LIMIT 1`, [roleId]);
  if (!roleResult.rowCount || roleResult.rows[0].scope !== 'GLOBAL') {
    return;
  }

  await pool.query(
    `INSERT INTO user_global_role (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId]
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_GLOBAL_ROLE_ASSIGNED', jsonb_build_object('targetUserId', $2::text, 'roleName', $3::text))`,
    [actingSession.user.id, userId, roleResult.rows[0].name as string]
  );

  revalidatePath('/support/users');
}

export async function revokeGlobalRole(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');

  if (!userId || !roleId) {
    return;
  }

  const deleted = await pool.query(
    `DELETE FROM user_global_role
     WHERE user_id = $1 AND role_id = $2
     RETURNING id`,
    [userId, roleId]
  );

  if (!deleted.rowCount) {
    return;
  }

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_GLOBAL_ROLE_REVOKED', jsonb_build_object('targetUserId', $2::text, 'roleId', $3::text))`,
    [actingSession.user.id, userId, roleId]
  );

  revalidatePath('/support/users');
}

export async function assignWardRole(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');
  const wardId = String(formData.get('wardId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');

  if (!userId || !wardId || !roleId) {
    return;
  }

  const roleResult = await pool.query(`SELECT name, scope FROM role WHERE id = $1 LIMIT 1`, [roleId]);
  if (!roleResult.rowCount || roleResult.rows[0].scope !== 'WARD') {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', actingSession.user.id]);

    await client.query(
      `INSERT INTO ward_user_role (ward_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (ward_id, user_id, role_id) DO NOTHING`,
      [wardId, userId, roleId]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_WARD_ROLE_ASSIGNED', jsonb_build_object('targetUserId', $2::text, 'wardId', $3::text, 'roleName', $4::text))`,
      [actingSession.user.id, userId, wardId, roleResult.rows[0].name as string]
    );

    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to assign ward role');
  } finally {
    client.release();
  }

  revalidatePath('/support/users');
}

export async function revokeWardRole(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');
  const wardId = String(formData.get('wardId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');

  if (!userId || !wardId || !roleId) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', actingSession.user.id]);

    const deleted = await client.query(
      `DELETE FROM ward_user_role
       WHERE user_id = $1 AND ward_id = $2 AND role_id = $3
       RETURNING id`,
      [userId, wardId, roleId]
    );

    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_WARD_ROLE_REVOKED', jsonb_build_object('targetUserId', $2::text, 'wardId', $3::text, 'roleId', $4::text))`,
      [actingSession.user.id, userId, wardId, roleId]
    );

    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to revoke ward role');
  } finally {
    client.release();
  }

  revalidatePath('/support/users');
}

export async function grantSupportAccess(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');
  const wardId = String(formData.get('wardId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');
  const durationHours = Math.max(1, Number(formData.get('durationHours') ?? 24));
  const grantReason = String(formData.get('grantReason') ?? '').trim();

  if (!userId || !wardId || !roleId || !grantReason) {
    return;
  }

  const [roleResult, supportAdminResult] = await Promise.all([
    pool.query(`SELECT name, scope FROM role WHERE id = $1 LIMIT 1`, [roleId]),
    pool.query(
      `SELECT 1
         FROM user_global_role ugr
         JOIN role r ON r.id = ugr.role_id
        WHERE ugr.user_id = $1 AND r.name = 'SUPPORT_ADMIN'
        LIMIT 1`,
      [userId]
    )
  ]);

  if (!roleResult.rowCount || roleResult.rows[0].scope !== 'WARD' || !supportAdminResult.rowCount) {
    return;
  }

  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', actingSession.user.id]);

    const existing = await client.query(
      `SELECT is_support_assignment
         FROM ward_user_role
        WHERE ward_id = $1 AND user_id = $2 AND role_id = $3
        LIMIT 1`,
      [wardId, userId, roleId]
    );

    if (existing.rowCount && existing.rows[0].is_support_assignment !== true) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `INSERT INTO ward_user_role (
         ward_id,
         user_id,
         role_id,
         is_support_assignment,
         granted_by_user_id,
         grant_reason,
         expires_at,
         revoked_at,
         revoked_by_user_id,
         created_at
       ) VALUES ($1, $2, $3, true, $4, $5, $6::timestamptz, NULL, NULL, now())
       ON CONFLICT (ward_id, user_id, role_id)
       DO UPDATE SET
         is_support_assignment = EXCLUDED.is_support_assignment,
         granted_by_user_id = EXCLUDED.granted_by_user_id,
         grant_reason = EXCLUDED.grant_reason,
         expires_at = EXCLUDED.expires_at,
         revoked_at = NULL,
         revoked_by_user_id = NULL,
         created_at = now()`,
      [wardId, userId, roleId, actingSession.user.id, grantReason, expiresAt]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'SUPPORT_ACCESS_GRANTED', jsonb_build_object('targetUserId', $3::text, 'roleName', $4::text, 'grantReason', $5::text, 'expiresAt', $6::text))`,
      [wardId, actingSession.user.id, userId, roleResult.rows[0].name as string, grantReason, expiresAt]
    );

    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to grant temporary support access');
  } finally {
    client.release();
  }

  revalidatePath('/support/users');
}

export async function revokeSupportAccess(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const userId = String(formData.get('userId') ?? '');
  const wardId = String(formData.get('wardId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');

  if (!userId || !wardId || !roleId) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', actingSession.user.id]);

    const revoked = await client.query(
      `UPDATE ward_user_role
          SET revoked_at = now(),
              revoked_by_user_id = $4
        WHERE user_id = $1
          AND ward_id = $2
          AND role_id = $3
          AND is_support_assignment = true
          AND revoked_at IS NULL
        RETURNING id`,
      [userId, wardId, roleId, actingSession.user.id]
    );

    if (!revoked.rowCount) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'SUPPORT_ACCESS_REVOKED', jsonb_build_object('targetUserId', $3::text, 'roleId', $4::text))`,
      [wardId, actingSession.user.id, userId, roleId]
    );

    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to revoke temporary support access');
  } finally {
    client.release();
  }

  revalidatePath('/support/users');
}
