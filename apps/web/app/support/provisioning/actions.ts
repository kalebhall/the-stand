'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';
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

export async function createStake(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const name = String(formData.get('name') ?? '').trim();

  if (!name) {
    return;
  }

  const inserted = await pool.query(`INSERT INTO stake (name) VALUES ($1) RETURNING id, name`, [name]);

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_STAKE_CREATED', jsonb_build_object('stakeId', $2::text, 'stakeName', $3::text))`,
    [actingSession.user.id, inserted.rows[0].id as string, inserted.rows[0].name as string]
  );

  revalidatePath('/support/provisioning');
}

export async function updateStake(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const stakeId = String(formData.get('stakeId') ?? '');
  const name = String(formData.get('name') ?? '').trim();

  if (!stakeId || !name) {
    return;
  }

  await pool.query(`UPDATE stake SET name = $1 WHERE id = $2`, [name, stakeId]);

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_STAKE_UPDATED', jsonb_build_object('stakeId', $2::text, 'name', $3::text))`,
    [actingSession.user.id, stakeId, name]
  );

  revalidatePath('/support/provisioning');
}

export async function deleteStake(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const stakeId = String(formData.get('stakeId') ?? '');

  if (!stakeId) {
    return;
  }

  const deleted = await pool.query(`DELETE FROM stake WHERE id = $1 RETURNING id, name`, [stakeId]);

  if (!deleted.rowCount) {
    return;
  }

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_STAKE_DELETED', jsonb_build_object('stakeId', $2::text, 'name', $3::text))`,
    [actingSession.user.id, deleted.rows[0].id as string, deleted.rows[0].name as string]
  );

  revalidatePath('/support/provisioning');
}

export async function createWard(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const stakeId = String(formData.get('stakeId') ?? '');
  const wardName = String(formData.get('wardName') ?? '').trim();
  const unitNumberRaw = String(formData.get('unitNumber') ?? '').trim();
  const unitNumber = unitNumberRaw.length ? unitNumberRaw : null;

  if (!stakeId || !wardName) {
    return;
  }

  const inserted = await pool.query(
    `INSERT INTO ward (stake_id, name, unit_number)
     VALUES ($1, $2, $3)
     RETURNING id, name, stake_id, unit_number`,
    [stakeId, wardName, unitNumber]
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_WARD_CREATED', jsonb_build_object('wardId', $2::text, 'wardName', $3::text, 'stakeId', $4::text, 'unitNumber', $5::text))`,
    [
      actingSession.user.id,
      inserted.rows[0].id as string,
      inserted.rows[0].name as string,
      inserted.rows[0].stake_id as string,
      inserted.rows[0].unit_number as string | null
    ]
  );

  revalidatePath('/support/provisioning');
}

export async function updateWard(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const wardId = String(formData.get('wardId') ?? '');
  const stakeId = String(formData.get('stakeId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const unitNumberRaw = String(formData.get('unitNumber') ?? '').trim();
  const unitNumber = unitNumberRaw.length ? unitNumberRaw : null;

  if (!wardId || !stakeId || !name) {
    return;
  }

  await pool.query(
    `UPDATE ward
        SET stake_id = $1,
            name = $2,
            unit_number = $3
      WHERE id = $4`,
    [stakeId, name, unitNumber, wardId]
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_WARD_UPDATED', jsonb_build_object('wardId', $2::text, 'stakeId', $3::text, 'name', $4::text, 'unitNumber', $5::text))`,
    [actingSession.user.id, wardId, stakeId, name, unitNumber]
  );

  revalidatePath('/support/provisioning');
}

export async function deleteWard(formData: FormData) {
  const actingSession = await requireSupportAdmin();
  const wardId = String(formData.get('wardId') ?? '');

  if (!wardId) {
    return;
  }

  const deleted = await pool.query(`DELETE FROM ward WHERE id = $1 RETURNING id, name, stake_id`, [wardId]);

  if (!deleted.rowCount) {
    return;
  }

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_WARD_DELETED', jsonb_build_object('wardId', $2::text, 'name', $3::text, 'stakeId', $4::text))`,
    [
      actingSession.user.id,
      deleted.rows[0].id as string,
      deleted.rows[0].name as string,
      deleted.rows[0].stake_id as string
    ]
  );

  revalidatePath('/support/provisioning');
}
