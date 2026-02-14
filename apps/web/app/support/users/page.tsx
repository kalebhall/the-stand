import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';
import { hashPassword } from '@/src/auth/password';
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

type WardRow = {
  id: string;
  name: string;
};

type WardAssignmentRow = {
  user_id: string;
  ward_id: string;
  ward_name: string;
  role_id: string;
  role_name: string;
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

  async function createUser(formData: FormData) {
    'use server';

    const actingSession = await requireSupportAdmin();
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const displayNameRaw = String(formData.get('displayName') ?? '').trim();
    const displayName = displayNameRaw.length ? displayNameRaw : null;
    const password = String(formData.get('password') ?? '').trim();

    if (!email || password.length < 12) {
      return;
    }

    const passwordHash = await hashPassword(password);

    const inserted = await pool.query(
      `INSERT INTO user_account (email, display_name, password_hash, must_change_password)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email)
       DO NOTHING
       RETURNING id, email`,
      [email, displayName, passwordHash]
    );

    if (!inserted.rowCount) {
      return;
    }

    await pool.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_USER_CREATED', jsonb_build_object('targetUserId', $2::text, 'email', $3::text, 'hasPassword', true))`,
      [actingSession.user.id, inserted.rows[0].id as string, inserted.rows[0].email as string]
    );

    revalidatePath('/support/users');
  }

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

  async function assignWardRole(formData: FormData) {
    'use server';

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

    await pool.query(
      `INSERT INTO ward_user_role (ward_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (ward_id, user_id, role_id) DO NOTHING`,
      [wardId, userId, roleId]
    );

    await pool.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_WARD_ROLE_ASSIGNED', jsonb_build_object('targetUserId', $2::text, 'wardId', $3::text, 'roleName', $4::text))`,
      [actingSession.user.id, userId, wardId, roleResult.rows[0].name as string]
    );

    revalidatePath('/support/users');
  }

  async function revokeWardRole(formData: FormData) {
    'use server';

    const actingSession = await requireSupportAdmin();
    const userId = String(formData.get('userId') ?? '');
    const wardId = String(formData.get('wardId') ?? '');
    const roleId = String(formData.get('roleId') ?? '');

    if (!userId || !wardId || !roleId) {
      return;
    }

    const deleted = await pool.query(
      `DELETE FROM ward_user_role
       WHERE user_id = $1 AND ward_id = $2 AND role_id = $3
       RETURNING id`,
      [userId, wardId, roleId]
    );

    if (!deleted.rowCount) {
      return;
    }

    await pool.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_WARD_ROLE_REVOKED', jsonb_build_object('targetUserId', $2::text, 'wardId', $3::text, 'roleId', $4::text))`,
      [actingSession.user.id, userId, wardId, roleId]
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

  const wardAssignmentsResult = await pool.query(
    `SELECT wur.user_id,
            wur.ward_id,
            w.name AS ward_name,
            wur.role_id,
            r.name AS role_name
       FROM ward_user_role wur
       JOIN ward w ON w.id = wur.ward_id
       JOIN role r ON r.id = wur.role_id
      ORDER BY w.name ASC, r.name ASC`
  );

  const wardsResult = await pool.query(`SELECT id, name FROM ward ORDER BY name ASC`);
  const wardRolesResult = await pool.query(`SELECT id, name FROM role WHERE scope = 'WARD' ORDER BY name ASC`);

  const wardAssignmentsByUser = new Map<string, WardAssignmentRow[]>();

  for (const row of wardAssignmentsResult.rows as WardAssignmentRow[]) {
    const existing = wardAssignmentsByUser.get(row.user_id);
    if (existing) {
      existing.push(row);
      continue;
    }

    wardAssignmentsByUser.set(row.user_id, [row]);
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Support Console: User Administration</h1>
        <p className="text-muted-foreground">
          Manage all user accounts across the system. You can review ward and global role assignments and control account activation.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <h2 className="text-lg font-semibold">Create User Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a credential-based account. New users are required to change their password after first sign in.
        </p>
        <form action={createUser} className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <label className="text-xs text-muted-foreground">
            Email
            <input name="email" required type="email" className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">
            Display name
            <input name="displayName" className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">
            Temporary password
            <input
              name="password"
              required
              minLength={12}
              type="password"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button className="rounded-md border px-3 py-2 text-sm font-medium" type="submit">
            Create account
          </button>
        </form>
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

            <form action={assignWardRole} className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <input type="hidden" name="userId" value={user.id} />
              <label className="text-xs text-muted-foreground">
                Ward
                <select name="wardId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                  <option value="">Select ward</option>
                  {(wardsResult.rows as WardRow[]).map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {ward.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Ward role
                <select name="roleId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                  <option value="">Select role</option>
                  {wardRolesResult.rows.map((role) => (
                    <option key={role.id as string} value={role.id as string}>
                      {role.name as string}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded-md border px-3 py-2 text-sm font-medium" type="submit">
                Assign to ward
              </button>
            </form>

            {(wardAssignmentsByUser.get(user.id) ?? []).length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {(wardAssignmentsByUser.get(user.id) ?? []).map((assignment) => (
                  <li key={`${assignment.ward_id}:${assignment.role_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <span>
                      {assignment.role_name} @ {assignment.ward_name}
                    </span>
                    <form action={revokeWardRole}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="wardId" value={assignment.ward_id} />
                      <input type="hidden" name="roleId" value={assignment.role_id} />
                      <button className="rounded-md border px-2 py-1 text-xs font-medium" type="submit">
                        Revoke
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}

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
