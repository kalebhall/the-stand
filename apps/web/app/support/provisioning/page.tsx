import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

type StakeRow = {
  id: string;
  name: string;
  created_at: string;
};

type WardRow = {
  id: string;
  stake_id: string;
  name: string;
  unit_number: string | null;
  stake_name: string;
  created_at: string;
};

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

export default async function SupportProvisioningPage() {
  const session = await requireSupportAdmin();

  async function createStake(formData: FormData) {
    'use server';

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

  async function createWard(formData: FormData) {
    'use server';

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

  async function updateStake(formData: FormData) {
    'use server';

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

  async function deleteStake(formData: FormData) {
    'use server';

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

  async function updateWard(formData: FormData) {
    'use server';

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

  async function deleteWard(formData: FormData) {
    'use server';

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

  const stakesResult = await pool.query(`SELECT id, name, created_at FROM stake ORDER BY name ASC`);
  const wardsResult = await pool.query(
    `SELECT w.id, w.stake_id, w.name, w.unit_number, s.name AS stake_name, w.created_at
       FROM ward w
       JOIN stake s ON s.id = w.stake_id
      ORDER BY s.name ASC, w.name ASC`
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_PROVISIONING_VIEWED', jsonb_build_object('stakeCount', $2::int, 'wardCount', $3::int))`,
    [session.user.id, stakesResult.rowCount ?? 0, wardsResult.rowCount ?? 0]
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Support Console: Stake & Ward Provisioning</h1>
        <p className="text-muted-foreground">
          Create new stakes and wards for onboarding. Keep names and unit numbers current so ward admin assignments can be completed.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border bg-card p-4 text-card-foreground">
          <h2 className="font-semibold">Create Stake</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add a new stake record before creating wards under it.</p>
          <form action={createStake} className="mt-3 space-y-3">
            <input name="name" required placeholder="Stake name" className="w-full rounded-md border px-3 py-2 text-sm" />
            <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
              Create stake
            </button>
          </form>
        </article>

        <article className="rounded-lg border bg-card p-4 text-card-foreground">
          <h2 className="font-semibold">Create Ward</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select the parent stake and enter ward metadata.</p>
          <form action={createWard} className="mt-3 space-y-3">
            <select name="stakeId" required className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">Select stake</option>
              {(stakesResult.rows as StakeRow[]).map((stake) => (
                <option key={stake.id} value={stake.id}>
                  {stake.name}
                </option>
              ))}
            </select>
            <input name="wardName" required placeholder="Ward name" className="w-full rounded-md border px-3 py-2 text-sm" />
            <input name="unitNumber" placeholder="Unit number (optional)" className="w-full rounded-md border px-3 py-2 text-sm" />
            <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
              Create ward
            </button>
          </form>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border bg-card p-4 text-card-foreground">
          <h2 className="font-semibold">Current Stakes</h2>
          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
            {(stakesResult.rows as StakeRow[]).map((stake) => (
              <li key={stake.id} className="rounded-md border p-3">
                <form action={updateStake} className="space-y-2">
                  <input type="hidden" name="stakeId" value={stake.id} />
                  <input
                    name="name"
                    required
                    defaultValue={stake.name}
                    aria-label={`Stake name for ${stake.name}`}
                    className="w-full rounded-md border px-3 py-2"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
                      Save
                    </button>
                  </div>
                </form>
                <form action={deleteStake} className="mt-2">
                  <input type="hidden" name="stakeId" value={stake.id} />
                  <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-lg border bg-card p-4 text-card-foreground">
          <h2 className="font-semibold">Current Wards</h2>
          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
            {(wardsResult.rows as WardRow[]).map((ward) => (
              <li key={ward.id} className="rounded-md border p-3">
                <form action={updateWard} className="space-y-2">
                  <input type="hidden" name="wardId" value={ward.id} />
                  <select name="stakeId" required defaultValue={ward.stake_id} className="w-full rounded-md border px-3 py-2">
                    {(stakesResult.rows as StakeRow[]).map((stake) => (
                      <option key={stake.id} value={stake.id}>
                        {stake.name}
                      </option>
                    ))}
                  </select>
                  <input name="name" required defaultValue={ward.name} className="w-full rounded-md border px-3 py-2" />
                  <input name="unitNumber" defaultValue={ward.unit_number ?? ''} placeholder="Unit number" className="w-full rounded-md border px-3 py-2" />
                  <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
                    Save
                  </button>
                </form>
                <form action={deleteWard} className="mt-2">
                  <input type="hidden" name="wardId" value={ward.id} />
                  <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
