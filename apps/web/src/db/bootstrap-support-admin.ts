import crypto from 'node:crypto';

import { hashPassword } from '@/src/auth/password';
import { GLOBAL_ROLES, WARD_ROLES } from '@/src/auth/roles';

import { pool } from './client';

let bootstrapAttempted = false;

export function generateBootstrapPassword(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export async function ensureSupportAdminBootstrap(): Promise<void> {
  if (bootstrapAttempted) return;

  const supportEmail = process.env.SUPPORT_ADMIN_EMAIL;
  if (!supportEmail) {
    // During build/prerendering, env vars and database are not available.
    // Skip bootstrap — it will run on the first real request at runtime.
    return;
  }

  bootstrapAttempted = true;

  for (const name of GLOBAL_ROLES) {
    await pool.query("INSERT INTO role (name, scope) VALUES ($1, 'GLOBAL') ON CONFLICT (name) DO NOTHING", [name]);
  }
  for (const name of WARD_ROLES) {
    await pool.query("INSERT INTO role (name, scope) VALUES ($1, 'WARD') ON CONFLICT (name) DO NOTHING", [name]);
  }

  const roleResult = await pool.query(
    `SELECT u.id
      FROM user_account u
      INNER JOIN user_global_role ugr ON ugr.user_id = u.id
      INNER JOIN role r ON r.id = ugr.role_id
     WHERE r.name = 'SUPPORT_ADMIN' AND u.email = $1
     LIMIT 1`,
    [supportEmail]
  );

  if (roleResult.rowCount && roleResult.rowCount > 0) {
    const isE2eDatabase = process.env.E2E_TEST_MODE === '1'
      && process.env.NODE_ENV !== 'production'
      && Boolean(process.env.TEST_DATABASE_URL)
      && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL;
    if (isE2eDatabase) {
      const password = process.env.SUPPORT_ADMIN_INITIAL_PASSWORD;
      if (!password) throw new Error('SUPPORT_ADMIN_INITIAL_PASSWORD is required in E2E_TEST_MODE');
      const hash = await hashPassword(password);
      await pool.query(
        `UPDATE user_account SET password_hash = $1, must_change_password = true, is_active = true
         WHERE email = $2`,
        [hash, supportEmail]
      );
    }
    return;
  }

  const password = process.env.SUPPORT_ADMIN_INITIAL_PASSWORD;
  if (!password) {
    throw new Error('SUPPORT_ADMIN_INITIAL_PASSWORD is required when bootstrapping support admin');
  }
  const hash = await hashPassword(password);

  const userResult = await pool.query(
    `INSERT INTO user_account (email, password_hash, must_change_password)
     VALUES ($1, $2, true)
     ON CONFLICT (email)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, must_change_password = true
     RETURNING id`,
    [supportEmail, hash]
  );

  await pool.query(
    `INSERT INTO user_global_role (user_id, role_id)
     VALUES ($1, (SELECT id FROM role WHERE name = 'SUPPORT_ADMIN'))
     ON CONFLICT DO NOTHING`,
    [userResult.rows[0].id]
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_ADMIN_BOOTSTRAPPED', jsonb_build_object('email', $2::text))`,
    [userResult.rows[0].id, supportEmail]
  );

  console.info(`Support Admin bootstrap completed for ${supportEmail}; password supplied through environment`);
}
