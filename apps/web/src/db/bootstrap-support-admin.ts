import crypto from 'node:crypto';

import argon2 from 'argon2';

import { pool } from './client';

let bootstrapAttempted = false;

export async function ensureSupportAdminBootstrap(): Promise<void> {
  if (bootstrapAttempted) return;
  bootstrapAttempted = true;

  const supportEmail = process.env.SUPPORT_ADMIN_EMAIL;
  if (!supportEmail) {
    throw new Error('SUPPORT_ADMIN_EMAIL is required for bootstrap');
  }

  await pool.query("INSERT INTO role (name, scope) VALUES ('SUPPORT_ADMIN', 'GLOBAL') ON CONFLICT (name) DO NOTHING");

  const roleResult = await pool.query(
    `SELECT u.id
      FROM user_account u
      INNER JOIN user_global_role ugr ON ugr.user_id = u.id
      INNER JOIN role r ON r.id = ugr.role_id
     WHERE r.name = 'SUPPORT_ADMIN'
     LIMIT 1`
  );

  if (roleResult.rowCount && roleResult.rowCount > 0) {
    return;
  }

  const password = crypto.randomBytes(24).toString('base64url');
  const hash = await argon2.hash(password, { type: argon2.argon2id });

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

  console.log(`Support Admin bootstrap password (shown once): ${password}`);
}
