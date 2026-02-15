import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

import UserAdminManager from './UserAdminManager';
import type { UserRow, WardOption, RoleOption, WardAssignment, GlobalAssignment } from './UserAdminManager';

export default async function SupportUsersPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    redirect('/dashboard');
  }

  const usersResult = await pool.query(
    `SELECT ua.id,
            ua.email,
            ua.display_name,
            ua.is_active,
            ua.password_hash IS NOT NULL AS has_password,
            ua.created_at,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT gr.name), NULL) AS global_roles,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT wr.name || ' @ ' || w.name), NULL) AS ward_roles
       FROM user_account ua
       LEFT JOIN user_global_role ugr ON ugr.user_id = ua.id
       LEFT JOIN role gr ON gr.id = ugr.role_id
       LEFT JOIN ward_user_role wur ON wur.user_id = ua.id
       LEFT JOIN role wr ON wr.id = wur.role_id
       LEFT JOIN ward w ON w.id = wur.ward_id
      GROUP BY ua.id, ua.email, ua.display_name, ua.is_active, ua.password_hash, ua.created_at
      ORDER BY ua.created_at DESC`
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

  const globalAssignmentsResult = await pool.query(
    `SELECT ugr.user_id,
            ugr.role_id,
            r.name AS role_name
       FROM user_global_role ugr
       JOIN role r ON r.id = ugr.role_id
      ORDER BY r.name ASC`
  );

  const wardsResult = await pool.query(`SELECT id, name FROM ward ORDER BY name ASC`);
  const globalRolesResult = await pool.query(`SELECT id, name, scope FROM role WHERE scope = 'GLOBAL' ORDER BY name ASC`);
  const wardRolesResult = await pool.query(`SELECT id, name, scope FROM role WHERE scope = 'WARD' ORDER BY name ASC`);

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_USERS_VIEWED', jsonb_build_object('count', $2::int))`,
    [session.user.id, usersResult.rowCount ?? 0]
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <Link href="/support" className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }))}>
            &larr; Support Console
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">User Administration</h1>
        <p className="text-muted-foreground">
          Manage all user accounts, role assignments, and account status across the system.
        </p>
      </section>

      <UserAdminManager
        users={usersResult.rows as UserRow[]}
        wards={wardsResult.rows as WardOption[]}
        globalRoles={globalRolesResult.rows as RoleOption[]}
        wardRoles={wardRolesResult.rows as RoleOption[]}
        wardAssignments={wardAssignmentsResult.rows as WardAssignment[]}
        globalAssignments={globalAssignmentsResult.rows as GlobalAssignment[]}
        currentUserId={session.user.id}
      />
    </main>
  );
}
