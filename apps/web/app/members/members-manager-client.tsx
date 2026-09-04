'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { InternalNotesPanel, type InternalNoteRow } from '@/components/InternalNotesPanel';
import { cn } from '@/lib/utils';

type MemberRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
};

type MemberNoteRow = InternalNoteRow & {
  member_id: string;
};

type EditDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

function displayName(member: MemberRow): string {
  if (member.first_name && member.last_name) {
    return `${member.first_name} ${member.last_name}`;
  }
  if (member.first_name) return member.first_name;
  if (member.last_name) return member.last_name;
  return member.full_name;
}

export function MembersManagerClient({
  wardId,
  members,
  memberNotes,
  canManageMembers
}: {
  wardId: string;
  members: MemberRow[];
  memberNotes: MemberNoteRow[];
  canManageMembers: boolean;
}) {
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [isSavingEditId, setIsSavingEditId] = useState<string | null>(null);
  const [isArchivingMemberId, setIsArchivingMemberId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, EditDraft>>({});

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        (m.first_name && m.first_name.toLowerCase().includes(q)) ||
        (m.last_name && m.last_name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.phone && m.phone.includes(q))
    );
  }, [members, search]);

  function startEdit(member: MemberRow) {
    setEditDrafts((prev) => ({
      ...prev,
      [member.id]: {
        firstName: member.first_name ?? '',
        lastName: member.last_name ?? '',
        email: member.email ?? '',
        phone: member.phone ?? ''
      }
    }));
    setEditingMemberId(member.id);
    setActionError(null);
  }

  async function saveEdit(memberId: string) {
    const draft = editDrafts[memberId];
    if (!draft) return;

    setIsSavingEditId(memberId);
    setActionError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          phone: draft.phone
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setActionError(payload.error ?? 'Failed to save changes.');
        return;
      }

      window.location.reload();
    } catch {
      setActionError('Failed to save changes.');
    } finally {
      setIsSavingEditId(null);
    }
  }

  async function archiveMember(memberId: string, name: string) {
    if (!window.confirm(`Archive ${name}? They will no longer appear in active member lists but historical records are preserved.`)) {
      return;
    }

    setIsArchivingMemberId(memberId);
    setActionError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/members/${memberId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setActionError(payload.error ?? 'Failed to archive member.');
        return;
      }

      window.location.reload();
    } catch {
      setActionError('Failed to archive member.');
    } finally {
      setIsArchivingMemberId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Filter members by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm"
        />
        <div className="text-sm text-muted-foreground">
          Showing {filteredMembers.length} of {members.length} members
        </div>
      </div>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      <div className="space-y-3">
        {filteredMembers.length ? (
          filteredMembers.map((member) => (
            <article key={member.id} className="rounded-md border p-4 bg-background/50">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-base">{displayName(member)}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {member.email ?? 'No email'} · {member.phone ?? 'No phone'}
                    {member.age != null ? ` · Age ${member.age}` : ''}
                    {member.gender ? ` · ${member.gender}` : ''}
                  </p>
                </div>
                {canManageMembers ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => startEdit(member)}
                      disabled={editingMemberId === member.id}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void archiveMember(member.id, displayName(member))}
                      disabled={isArchivingMemberId === member.id}
                      className="text-xs h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      {isArchivingMemberId === member.id ? 'Archiving…' : 'Archive'}
                    </Button>
                  </div>
                ) : null}
              </div>
              {editingMemberId === member.id && (
                <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Edit Member Info</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">First Name</label>
                      <input
                        type="text"
                        value={editDrafts[member.id]?.firstName ?? ''}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [member.id]: { ...prev[member.id]!, firstName: e.target.value }
                          }))
                        }
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                        placeholder="First name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Last Name</label>
                      <input
                        type="text"
                        value={editDrafts[member.id]?.lastName ?? ''}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [member.id]: { ...prev[member.id]!, lastName: e.target.value }
                          }))
                        }
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                        placeholder="Last name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Email</label>
                      <input
                        type="email"
                        value={editDrafts[member.id]?.email ?? ''}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [member.id]: { ...prev[member.id]!, email: e.target.value }
                          }))
                        }
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Phone</label>
                      <input
                        type="tel"
                        value={editDrafts[member.id]?.phone ?? ''}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [member.id]: { ...prev[member.id]!, phone: e.target.value }
                          }))
                        }
                        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                        placeholder="(702) 555-0100"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => void saveEdit(member.id)}
                      disabled={isSavingEditId === member.id}
                    >
                      {isSavingEditId === member.id ? 'Saving…' : 'Save'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setEditingMemberId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-3">
                <InternalNotesPanel
                  wardId={wardId}
                  target={{ type: 'MEMBER', memberId: member.id }}
                  notes={memberNotes.filter((note) => note.member_id === member.id)}
                  title="Member notes"
                />
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-md border border-dashed p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {members.length === 0 ? 'No members imported yet.' : 'No members matched your search.'}
            </p>
            {members.length === 0 && (
              <Link href="/imports/members" className={cn(buttonVariants({ size: 'sm' }))}>
                Import Members Now
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
