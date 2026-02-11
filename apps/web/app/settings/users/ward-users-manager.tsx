'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

const assignableRoles = ['BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK', 'CONDUCTOR_VIEW'] as const;

type WardUserRole = {
  id: string;
  name: string;
};

type WardUser = {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  roles: WardUserRole[];
};

export function WardUsersManager({ wardId }: { wardId: string }) {
  const [users, setUsers] = useState<WardUser[]>([]);
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setStatus(null);

    const response = await fetch(`/api/w/${wardId}/users`, { cache: 'no-store' });
    if (!response.ok) {
      setStatus('Unable to load ward users.');
      setLoading(false);
      return;
    }

    const data = (await response.json()) as { users: WardUser[] };
    setUsers(data.users);
    setLoading(false);
  }, [wardId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const assignRole = useCallback(
    async (userId: string) => {
      const roleName = selectedRoleByUser[userId];
      if (!roleName) {
        return;
      }

      setStatus(null);
      const response = await fetch(`/api/w/${wardId}/users/${userId}/roles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleName })
      });

      if (!response.ok) {
        setStatus('Unable to assign role.');
        return;
      }

      setStatus('Role assigned.');
      await loadUsers();
    },
    [loadUsers, selectedRoleByUser, wardId]
  );

  const revokeRole = useCallback(
    async (userId: string, role: WardUserRole) => {
      setStatus(null);
      const response = await fetch(`/api/w/${wardId}/users/${userId}/roles/${role.id}`, { method: 'DELETE' });

      if (!response.ok) {
        setStatus('Unable to revoke role.');
        return;
      }

      setStatus('Role revoked.');
      await loadUsers();
    },
    [loadUsers, wardId]
  );

  const roleOptions = useMemo(
    () => assignableRoles.map((roleName) => <option key={roleName}>{roleName}</option>),
    []
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading users…</p>;
  }

  return (
    <section className="space-y-4">
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      <ul className="space-y-4">
        {users.map((user) => (
          <li key={user.id} className="rounded-lg border p-4">
            <p className="font-medium">{user.displayName || user.email}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-2 text-sm">Roles: {user.roles.map((role) => role.name).join(', ') || 'None'}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <select
                className="rounded-md border px-2 py-1 text-sm"
                onChange={(event) => {
                  setSelectedRoleByUser((current) => ({
                    ...current,
                    [user.id]: event.target.value
                  }));
                }}
                value={selectedRoleByUser[user.id] ?? ''}
              >
                <option value="">Select role…</option>
                {roleOptions}
              </select>
              <Button onClick={() => void assignRole(user.id)} size="sm" type="button">
                Assign role
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {user.roles
                .filter((role) => role.name !== 'STAND_ADMIN')
                .map((role) => (
                  <Button key={role.id} onClick={() => void revokeRole(user.id, role)} size="sm" type="button" variant="outline">
                    Revoke {role.name}
                  </Button>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
