'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import {
  createUser,
  createGoogleProvisionedUser,
  updateUser,
  deleteUser,
  setUserActivation,
  assignGlobalRole,
  revokeGlobalRole,
  assignWardRole,
  revokeWardRole,
  grantSupportAccess,
  revokeSupportAccess
} from './actions';
import { getSupportAccessState } from './support-grants';

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
  is_support_assignment?: boolean;
  grant_reason?: string | null;
  expires_at?: string | null;
  created_at?: string;
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
  const t = useTranslations('supportUsers');
  const locale = useLocale();
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale).format(new Date(value));
  const formatDateTime = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
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
            {t('search')}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t('status')}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            >
              <option value="all">{t('allStatuses')}</option>
              <option value="active">{t('activeOnly')}</option>
              <option value="inactive">{t('inactiveOnly')}</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t('role')}
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            >
              <option value="">{t('allRoles')}</option>
              {allRoleNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? t('cancel') : t('createUser')}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('showingUsers', { shown: filteredUsers.length, total: users.length })}
        </p>
      </section>

      {/* Create User Form */}
      {showCreate && (
        <section className="rounded-lg border bg-card p-4 text-card-foreground">
          <h2 className="text-lg font-semibold">{t('createUserAccount')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {googleOnly
              ? t('googleOnlyDescription')
              : t('passwordAccountDescription')}
          </p>
          <form
            action={async (formData) => {
              if (googleOnly) await createGoogleProvisionedUser(formData);
              else await createUser(formData);
              handleCreateSubmit();
            }}
            className="mt-3 space-y-3"
          >
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={googleOnly} onChange={(e) => setGoogleOnly(e.target.checked)} className="rounded border" />
                {t('googleOnly')}
              </label>
              <input type="hidden" name="googleOnly" value={googleOnly ? '1' : '0'} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                {t('email')}
                <input name="email" required type="email" className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">
                {t('displayName')}
                <input name="displayName" className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground" />
              </label>
            </div>
            {googleOnly && (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  {t('ward')}
                  <select name="wardId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                    <option value="">{t('selectWard')}</option>
                    {wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  {t('initialRole')}
                  <select name="roleId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                    <option value="">{t('selectRole')}</option>
                    {wardRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </label>
              </div>
            )}
            {!googleOnly && (
              <label className="block text-xs text-muted-foreground">
                {t('temporaryPassword')}
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
              {t('createAccount')}
            </Button>
          </form>
        </section>
      )}

      {/* User List */}
      <section className="space-y-3">
        {filteredUsers.length === 0 && <p className="text-sm text-muted-foreground">{t('noUsers')}</p>}
        {filteredUsers.map((user) => {
          const isEditing = editingId === user.id;
          const userWardAssignments = wardAssignmentsByUser.get(user.id) ?? [];
          const userGlobalAssignments = globalAssignmentsByUser.get(user.id) ?? [];
          const { canGrantSupportAccess, standardAssignments, supportAssignments } = getSupportAccessState({
            user,
            assignments: userWardAssignments
          });
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
                      {user.is_active ? t('active') : t('inactive')}
                    </span>
                    {!user.has_password && (
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {t('googleOnlyBadge')}
                      </span>
                    )}
                    {isSelf && (
                      <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">{t('you')}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <div className="flex flex-wrap gap-1">
                    {userGlobalAssignments.map((a) => (
                      <span key={a.role_id} className="inline-block rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">
                        {a.role_name}
                      </span>
                    ))}
                    {userWardAssignments.map((a) => (
                      <span
                        key={`${a.ward_id}:${a.role_id}`}
                        className={`inline-block rounded px-1.5 py-0.5 text-xs ${a.is_support_assignment ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'}`}
                      >
                        {a.role_name} @ {a.ward_name}
                        {a.is_support_assignment ? ' (support)' : ''}
                      </span>
                    ))}
                    {userGlobalAssignments.length === 0 && userWardAssignments.length === 0 && (
                      <span className="text-xs text-muted-foreground">{t('noRoles')}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{t('created')}: {formatDate(user.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingId(isEditing ? null : user.id)}>
                    {isEditing ? t('close') : t('edit')}
                  </Button>
                  <form action={setUserActivation}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="nextState" value={user.is_active ? 'INACTIVE' : 'ACTIVE'} />
                    <Button variant="outline" size="sm" type="submit">
                      {user.is_active ? t('deactivate') : t('activate')}
                    </Button>
                  </form>
                  {!isSelf && (
                    <>
                      {confirmDeleteId === user.id ? (
                        <div className="flex items-center gap-1">
                          <form action={deleteUser}>
                            <input type="hidden" name="userId" value={user.id} />
                            <Button variant="destructive" size="sm" type="submit">
                              {t('confirmDelete')}
                            </Button>
                          </form>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                            {t('cancel')}
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(user.id)}>
                          {t('delete')}
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
                    <h3 className="text-sm font-semibold">{t('editProfile')}</h3>
                    <form
                      action={async (formData) => {
                        await updateUser(formData);
                        handleEditSubmit();
                      }}
                      className="mt-2 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <label className="text-xs text-muted-foreground">
                        {t('email')}
                        <input
                          name="email"
                          required
                          type="email"
                          defaultValue={user.email}
                          className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                        />
                      </label>
                      <label className="text-xs text-muted-foreground">
                        {t('displayName')}
                        <input
                          name="displayName"
                          defaultValue={user.display_name ?? ''}
                          className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                        />
                      </label>
                      <Button type="submit" size="sm">
                        {t('saveProfile')}
                      </Button>
                    </form>
                  </div>

                  {/* Global Roles */}
                  <div>
                    <h3 className="text-sm font-semibold">{t('globalRoles')}</h3>
                    {userGlobalAssignments.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {userGlobalAssignments.map((a) => (
                          <li key={a.role_id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span className="font-medium">{a.role_name}</span>
                            <form action={revokeGlobalRole}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="roleId" value={a.role_id} />
                              <Button variant="ghost" size="sm" type="submit">
                                {t('revoke')}
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">{t('noGlobalRoles')}</p>
                    )}
                    <form action={assignGlobalRole} className="mt-2 flex items-end gap-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <label className="flex-1 text-xs text-muted-foreground">
                        {t('assignGlobalRole')}
                        <select name="roleId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                          <option value="">{t('selectRole')}</option>
                          {globalRoles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button variant="outline" size="sm" type="submit">
                        {t('assign')}
                      </Button>
                    </form>
                  </div>

                  {/* Ward Roles */}
                  <div>
                    <h3 className="text-sm font-semibold">{t('wardRoles')}</h3>
                    {standardAssignments.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {standardAssignments.map((a) => (
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
                                {t('revoke')}
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">{t('noWardRoles')}</p>
                    )}
                    <form action={assignWardRole} className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                      <input type="hidden" name="userId" value={user.id} />
                      <label className="text-xs text-muted-foreground">
                        {t('ward')}
                        <select name="wardId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                          <option value="">{t('selectWard')}</option>
                          {wards.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">
                        {t('role')}
                        <select name="roleId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                          <option value="">{t('selectRole')}</option>
                          {wardRoles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button variant="outline" size="sm" type="submit">
                        {t('assign')}
                      </Button>
                    </form>
                  </div>

                  {(canGrantSupportAccess || supportAssignments.length > 0) && (
                    <div>
                      <h3 className="text-sm font-semibold">{t('temporarySupportAccess')}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('temporarySupportDescription')}
                      </p>
                      {supportAssignments.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {supportAssignments.map((a) => (
                            <li
                              key={`support:${a.ward_id}:${a.role_id}`}
                              className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                <p>
                                  <span className="font-medium">{a.role_name}</span>
                                  <span className="text-muted-foreground"> @ {a.ward_name}</span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t('expires')}: {a.expires_at ? formatDateTime(a.expires_at) : t('noExpiration')}
                                </p>
                                {a.grant_reason && <p className="text-xs text-muted-foreground">{t('reason')}: {a.grant_reason}</p>}
                              </div>
                              <form action={revokeSupportAccess}>
                                <input type="hidden" name="userId" value={user.id} />
                                <input type="hidden" name="wardId" value={a.ward_id} />
                                <input type="hidden" name="roleId" value={a.role_id} />
                                <Button variant="ghost" size="sm" type="submit">
                                  {t('revokeGrant')}
                                </Button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">{t('noTemporaryGrants')}</p>
                      )}

                      {canGrantSupportAccess && (
                        <form action={grantSupportAccess} className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_160px_1.5fr_auto] md:items-end">
                          <input type="hidden" name="userId" value={user.id} />
                          <label className="text-xs text-muted-foreground">
                            {t('ward')}
                            <select name="wardId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                              <option value="">{t('selectWard')}</option>
                              {wards.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-muted-foreground">
                            {t('role')}
                            <select name="roleId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                              <option value="">{t('selectRole')}</option>
                              {wardRoles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-muted-foreground">
                            {t('hours')}
                            <input
                              name="durationHours"
                              required
                              min={1}
                              defaultValue={24}
                              type="number"
                              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            {t('approvalReason')}
                            <input
                              name="grantReason"
                              required
                              placeholder={t('approvalReasonPlaceholder')}
                              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                            />
                          </label>
                          <Button variant="outline" size="sm" type="submit">
                            {t('grantAccess')}
                          </Button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
