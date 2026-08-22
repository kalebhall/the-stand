'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type MemberRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  birthday: string | null;
  gender: string | null;
};

type MemberNoteRow = {
  id: string;
  member_id: string;
  note_text: string;
  created_at: string;
  created_by_email: string | null;
};

export function MembersManagerClient({
  wardId,
  members,
  memberNotes
}: {
  wardId: string;
  members: MemberRow[];
  memberNotes: MemberNoteRow[];
}) {
  const [search, setSearch] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingMemberNoteId, setIsSavingMemberNoteId] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [isDeletingMemberId, setIsDeletingMemberId] = useState<string | null>(null);

  const primaryNoteByMemberId = useMemo(() => {
    return memberNotes.reduce<Record<string, MemberNoteRow>>((accumulator, note) => {
      if (!accumulator[note.member_id]) {
        accumulator[note.member_id] = note;
      }
      return accumulator;
    }, {});
  }, [memberNotes]);

  const [memberNoteDrafts, setMemberNoteDrafts] = useState<Record<string, string>>(() => {
    return members.reduce<Record<string, string>>((accumulator, member) => {
      const existingNote = memberNotes.find((note) => note.member_id === member.id);
      accumulator[member.id] = existingNote?.note_text ?? '';
      return accumulator;
    }, {});
  });

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.phone && m.phone.includes(q))
    );
  }, [members, search]);

  async function saveMemberNote(memberId: string) {
    const currentDraft = (memberNoteDrafts[memberId] ?? '').trim();
    const existingNote = primaryNoteByMemberId[memberId];
    const existingText = existingNote?.note_text ?? '';

    if (currentDraft === existingText) {
      return;
    }

    setIsSavingMemberNoteId(memberId);
    setNoteError(null);

    try {
      if (!currentDraft) {
        if (existingNote) {
          const response = await fetch(`/api/w/${wardId}/members/${memberId}/notes/${existingNote.id}`, {
            method: 'DELETE'
          });

          if (!response.ok) {
            const payload = (await response.json()) as { error?: string };
            setNoteError(payload.error ?? 'Failed to delete note.');
            return;
          }
        }

        window.location.reload();
        return;
      }

      const response = await fetch(
        existingNote ? `/api/w/${wardId}/members/${memberId}/notes/${existingNote.id}` : `/api/w/${wardId}/members/${memberId}/notes`,
        {
          method: existingNote ? 'PATCH' : 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ noteText: currentDraft })
        }
      );

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setNoteError(payload.error ?? 'Failed to save note.');
        return;
      }

      window.location.reload();
    } catch {
      setNoteError('Failed to save note.');
    } finally {
      setIsSavingMemberNoteId(null);
    }
  }

  async function deleteMember(memberId: string) {
    if (!window.confirm('Delete this member and any notes/callings tied to them?')) {
      return;
    }

    setIsDeletingMemberId(memberId);
    setNoteError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/members/${memberId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setNoteError(payload.error ?? 'Failed to delete member.');
        return;
      }

      window.location.reload();
    } catch {
      setNoteError('Failed to delete member.');
    } finally {
      setIsDeletingMemberId(null);
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

      {noteError ? <p className="text-sm text-red-600">{noteError}</p> : null}

      <div className="space-y-3">
        {filteredMembers.length ? (
          filteredMembers.map((member) => (
            <article key={member.id} className="rounded-md border p-4 bg-background/50">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-base">{member.full_name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {member.email ?? 'No email'} · {member.phone ?? 'No phone'}
                    {member.age != null ? ` · Age ${member.age}` : ''}
                    {member.birthday ? ` · Birthday: ${member.birthday}` : ''}
                    {member.gender ? ` · ${member.gender}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => deleteMember(member.id)}
                  disabled={isDeletingMemberId === member.id}
                  className="text-destructive hover:bg-destructive/10"
                >
                  Delete member
                </Button>
              </div>
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Bishopric / Clerk Note</p>
                {editingMemberId === member.id ? (
                  <textarea
                    id={`member-note-${member.id}`}
                    value={memberNoteDrafts[member.id] ?? ''}
                    onChange={(event) =>
                      setMemberNoteDrafts((current) => ({
                        ...current,
                        [member.id]: event.target.value
                      }))
                    }
                    onBlur={() => {
                      setEditingMemberId(null);
                      void saveMemberNote(member.id);
                    }}
                    className="min-h-20 w-full rounded-md border bg-background p-2.5 text-sm font-sans"
                    placeholder="Add a restricted member note (saved on blur)"
                    autoFocus
                  />
                ) : (
                  <div
                    className="min-h-14 cursor-text rounded-md border bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                    onDoubleClick={() => setEditingMemberId(member.id)}
                    title="Double-click to edit note"
                  >
                    {(memberNoteDrafts[member.id] ?? '').trim() || (
                      <span className="text-muted-foreground italic text-xs">No note. Double-click to add.</span>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {isSavingMemberNoteId === member.id ? 'Saving…' : 'Double-click to edit.'}
                </p>
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
