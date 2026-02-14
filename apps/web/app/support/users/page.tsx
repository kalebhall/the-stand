import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  global_roles: string[] | null;
  ward_roles: string[] | null;
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

export default async function SupportUsersPage() {
  const session = await requireSupportAdmin();

  async function setUserActivation(formData: FormData) {
    'use server';

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

  async function updateUser(formData: FormData) {
    'use server';

    const actingSession = await requireSupportAdmin();
    const userId = String(formData.get('userId') ?? '');
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
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

  async function deleteUser(formData: FormData) {
    'use server';

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

  const usersResult = await pool.query(
    `SELECT ua.id,
            ua.email,
            ua.display_name,
            ua.is_active,
            ua.created_at,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT gr.name), NULL) AS global_roles,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT wr.name || ' @ ' || w.name), NULL) AS ward_roles
       FROM user_account ua
       LEFT JOIN user_global_role ugr ON ugr.user_id = ua.id
       LEFT JOIN role gr ON gr.id = ugr.role_id
       LEFT JOIN ward_user_role wur ON wur.user_id = ua.id
       LEFT JOIN role wr ON wr.id = wur.role_id
       LEFT JOIN ward w ON w.id = wur.ward_id
      GROUP BY ua.id, ua.email, ua.display_name, ua.is_active, ua.created_at
      ORDER BY ua.created_at DESC`
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_USERS_VIEWED', jsonb_build_object('count', $2::int))`,
    [session.user.id, usersResult.rowCount ?? 0]
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Support Console: User Administration</h1>
        <p className="text-muted-foreground">
          Manage all user accounts across the system. You can review ward and global role assignments and control account activation.
        </p>
      </section>

      <section className="space-y-3">
        {(usersResult.rows as UserRow[]).map((user) => (
          <article key={user.id} className="rounded-lg border bg-card p-4 text-card-foreground">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">{user.display_name ?? user.email}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground">Created: {new Date(user.created_at).toLocaleString()}</p>
              </div>
              <form action={setUserActivation}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="nextState" value={user.is_active ? 'INACTIVE' : 'ACTIVE'} />
                <button className="rounded-md border px-3 py-2 text-sm font-medium" type="submit">
                  {user.is_active ? 'Deactivate account' : 'Activate account'}
                </button>
              </form>
            </div>

            <form action={updateUser} className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <input type="hidden" name="userId" value={user.id} />
              <label className="text-xs text-muted-foreground">
                Email
                <input
                  name="email"
                  required
                  type="email"
                  defaultValue={user.email}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Display name
                <input
                  name="displayName"
                  defaultValue={user.display_name ?? ''}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button className="rounded-md border px-3 py-2 text-sm font-medium" type="submit">
                Save profile
              </button>
            </form>

            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div>
                <p className="font-medium">Global roles</p>
                <p className="text-muted-foreground">{user.global_roles?.length ? user.global_roles.join(', ') : 'None assigned'}</p>
              </div>
              <div>
                <p className="font-medium">Ward roles</p>
                <p className="text-muted-foreground">{user.ward_roles?.length ? user.ward_roles.join(', ') : 'No ward assignments'}</p>
              </div>
            </div>

            <form action={deleteUser} className="mt-3">
              <input type="hidden" name="userId" value={user.id} />
              <button
                className="rounded-md border px-3 py-2 text-sm font-medium"
                type="submit"
                disabled={user.id === session.user.id}
                title={user.id === session.user.id ? 'You cannot delete your own account.' : undefined}
              >
                Delete account
              </button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
