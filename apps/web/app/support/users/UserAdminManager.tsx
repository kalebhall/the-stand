'use client';

import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

import {
  createUser,
  updateUser,
  deleteUser,
  setUserActivation,
  assignGlobalRole,
  revokeGlobalRole,
  assignWardRole,
  revokeWardRole
} from './actions';

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  has_password: boolean;
  created_at: string;
  global_roles: string[] | null;
  ward_roles: string[] | null;
};

export type WardOption = {
  id: string;
  name: string;
};

export type RoleOption = {
  id: string;
  name: string;
  scope: string;
};

export type WardAssignment = {
  user_id: string;
  ward_id: string;
  ward_name: string;
  role_id: string;
  role_name: string;
};

export type GlobalAssignment = {
  user_id: string;
  role_id: string;
  role_name: string;
};

type Props = {
  users: UserRow[];
  wards: WardOption[];
  globalRoles: RoleOption[];
  wardRoles: RoleOption[];
  wardAssignments: WardAssignment[];
  globalAssignments: GlobalAssignment[];
  currentUserId: string;
};

type FilterStatus = 'all' | 'active' | 'inactive';

export default function UserAdminManager({
  users,
  wards,
  globalRoles,
  wardRoles,
  wardAssignments,
  globalAssignments,
  currentUserId
}: Props) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterRole, setFilterRole] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [googleOnly, setGoogleOnly] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const wardAssignmentsByUser = useMemo(() => {
    const map = new Map<string, WardAssignment[]>();
    for (const a of wardAssignments) {
      const existing = map.get(a.user_id);
      if (existing) {
        existing.push(a);
      } else {
        map.set(a.user_id, [a]);
      }
    }
    return map;
  }, [wardAssignments]);

  const globalAssignmentsByUser = useMemo(() => {
    const map = new Map<string, GlobalAssignment[]>();
    for (const a of globalAssignments) {
      const existing = map.get(a.user_id);
      if (existing) {
        existing.push(a);
      } else {
        map.set(a.user_id, [a]);
      }
    }
    return map;
  }, [globalAssignments]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (filterStatus === 'active' && !u.is_active) return false;
      if (filterStatus === 'inactive' && u.is_active) return false;

      if (filterRole) {
        const allRoles = [...(u.global_roles ?? []), ...(u.ward_roles ?? [])];
        if (!allRoles.some((r) => r.toLowerCase().includes(filterRole.toLowerCase()))) return false;
      }

      if (q) {
        const matchEmail = u.email.toLowerCase().includes(q);
        const matchName = u.display_name?.toLowerCase().includes(q);
        if (!matchEmail && !matchName) return false;
      }

      return true;
    });
  }, [users, search, filterStatus, filterRole]);

  const handleCreateSubmit = useCallback(() => {
    setShowCreate(false);
    setGoogleOnly(false);
  }, []);

  const handleEditSubmit = useCallback(() => {
    setEditingId(null);
  }, []);

  const allRoleNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of globalRoles) names.add(r.name);
    for (const r of wardRoles) names.add(r.name);
    return Array.from(names).sort();
  }, [globalRoles, wardRoles]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            Search
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email..."
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Status
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Role
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            >
              <option value="">All roles</option>
              {allRoleNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? 'Cancel' : 'Create user'}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {filteredUsers.length} of {users.length} users
        </p>
      </section>

      {/* Create User Form */}
      {showCreate && (
        <section className="rounded-lg border bg-card p-4 text-card-foreground">
          <h2 className="text-lg font-semibold">Create User Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {googleOnly
              ? 'This user will sign in with Google. No password is required.'
              : 'Create a credential-based account. The user must change their password after first sign in.'}
          </p>
          <form
            action={async (formData) => {
              await createUser(formData);
              handleCreateSubmit();
            }}
            className="mt-3 space-y-3"
          >
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={googleOnly}
                  onChange={(e) => setGoogleOnly(e.target.checked)}
                  className="rounded border"
                />
                Google sign-in only (no password)
              </label>
              <input type="hidden" name="googleOnly" value={googleOnly ? '1' : '0'} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Email
                <input
                  name="email"
                  required
                  type="email"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Display name
                <input
                  name="displayName"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                />
              </label>
            </div>
            {!googleOnly && (
              <label className="block text-xs text-muted-foreground">
                Temporary password (min 12 characters)
                <input
                  name="password"
                  required
                  minLength={12}
                  type="password"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground md:max-w-sm"
                />
              </label>
            )}
            <Button type="submit" size="sm">
              Create account
            </Button>
          </form>
        </section>
      )}

      {/* User List */}
      <section className="space-y-3">
        {filteredUsers.length === 0 && (
          <p className="text-sm text-muted-foreground">No users match the current filters.</p>
        )}
        {filteredUsers.map((user) => {
          const isEditing = editingId === user.id;
          const userWardAssignments = wardAssignmentsByUser.get(user.id) ?? [];
          const userGlobalAssignments = globalAssignmentsByUser.get(user.id) ?? [];
          const isSelf = user.id === currentUserId;

          return (
            <article key={user.id} className="rounded-lg border bg-card text-card-foreground">
              {/* User Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{user.display_name ?? user.email}</p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {!user.has_password && (
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        Google only
                      </span>
                    )}
                    {isSelf && (
                      <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <div className="flex flex-wrap gap-1">
                    {userGlobalAssignments.map((a) => (
                      <span
                        key={a.role_id}
                        className="inline-block rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800"
                      >
                        {a.role_name}
                      </span>
                    ))}
                    {userWardAssignments.map((a) => (
                      <span
                        key={`${a.ward_id}:${a.role_id}`}
                        className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800"
                      >
                        {a.role_name} @ {a.ward_name}
                      </span>
                    ))}
                    {userGlobalAssignments.length === 0 && userWardAssignments.length === 0 && (
                      <span className="text-xs text-muted-foreground">No roles assigned</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingId(isEditing ? null : user.id)}>
                    {isEditing ? 'Close' : 'Edit'}
                  </Button>
                  <form action={setUserActivation}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="nextState" value={user.is_active ? 'INACTIVE' : 'ACTIVE'} />
                    <Button variant="outline" size="sm" type="submit">
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </form>
                  {!isSelf && (
                    <>
                      {confirmDeleteId === user.id ? (
                        <div className="flex items-center gap-1">
                          <form action={deleteUser}>
                            <input type="hidden" name="userId" value={user.id} />
                            <Button variant="destructive" size="sm" type="submit">
                              Confirm delete
                            </Button>
                          </form>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(user.id)}>
                          Delete
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Edit Panel */}
              {isEditing && (
                <div className="space-y-4 border-t px-4 py-4">
                  {/* Profile Edit */}
                  <div>
                    <h3 className="text-sm font-semibold">Edit Profile</h3>
                    <form
                      action={async (formData) => {
                        await updateUser(formData);
                        handleEditSubmit();
                      }}
                      className="mt-2 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
                    >
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
                      <Button type="submit" size="sm">
                        Save profile
                      </Button>
                    </form>
                  </div>

                  {/* Global Roles */}
                  <div>
                    <h3 className="text-sm font-semibold">Global Roles</h3>
                    {userGlobalAssignments.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {userGlobalAssignments.map((a) => (
                          <li
                            key={a.role_id}
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{a.role_name}</span>
                            <form action={revokeGlobalRole}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="roleId" value={a.role_id} />
                              <Button variant="ghost" size="sm" type="submit">
                                Revoke
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">No global roles assigned.</p>
                    )}
                    <form action={assignGlobalRole} className="mt-2 flex items-end gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <label className="flex-1 text-xs text-muted-foreground">
                        Assign global role
                        <select
                          name="roleId"
                          required
                          className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                        >
                          <option value="">Select role</option>
                          {globalRoles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button variant="outline" size="sm" type="submit">
                        Assign
                      </Button>
                    </form>
                  </div>

                  {/* Ward Roles */}
                  <div>
                    <h3 className="text-sm font-semibold">Ward Roles</h3>
                    {userWardAssignments.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {userWardAssignments.map((a) => (
                          <li
                            key={`${a.ward_id}:${a.role_id}`}
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                          >
                            <span>
                              <span className="font-medium">{a.role_name}</span>
                              <span className="text-muted-foreground"> @ {a.ward_name}</span>
                            </span>
                            <form action={revokeWardRole}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="wardId" value={a.ward_id} />
                              <input type="hidden" name="roleId" value={a.role_id} />
                              <Button variant="ghost" size="sm" type="submit">
                                Revoke
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">No ward roles assigned.</p>
                    )}
                    <form action={assignWardRole} className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                      <input type="hidden" name="userId" value={user.id} />
                      <label className="text-xs text-muted-foreground">
                        Ward
                        <select
                          name="wardId"
                          required
                          className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                        >
                          <option value="">Select ward</option>
                          {wards.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">
                        Role
                        <select
                          name="roleId"
                          required
                          className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                        >
                          <option value="">Select role</option>
                          {wardRoles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button variant="outline" size="sm" type="submit">
                        Assign
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
