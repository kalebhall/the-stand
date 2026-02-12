'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

type MemberRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type MemberNoteRow = {
  id: string;
  member_id: string;
  note_text: string;
  created_at: string;
  created_by_email: string | null;
};

type PreviewMember = {
  fullName: string;
  email: string | null;
  phone: string | null;
};

export function MembershipImportsClient({
  wardId,
  members,
  memberNotes
}: {
  wardId: string;
  members: MemberRow[];
  memberNotes: MemberNoteRow[];
}) {
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<PreviewMember[]>([]);
  const [summary, setSummary] = useState<{ parsedCount: number; inserted: number; updated: number; commit: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '');
  const [noteText, setNoteText] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  const notesByMemberId = useMemo(() => {
    return memberNotes.reduce<Record<string, MemberNoteRow[]>>((accumulator, note) => {
      const existing = accumulator[note.member_id] ?? [];
      existing.push(note);
      accumulator[note.member_id] = existing;
      return accumulator;
    }, {});
  }, [memberNotes]);

  async function submitImport(commit: boolean) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/imports/membership`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ rawText, commit })
      });

      const payload = (await response.json()) as
        | { preview: PreviewMember[]; parsedCount: number; inserted: number; updated: number; commit: boolean }
        | { error?: string };

      if (!response.ok || !('preview' in payload)) {
        setError(payload.error ?? 'Import failed');
        return;
      }

      setPreview(payload.preview);
      setSummary({
        parsedCount: payload.parsedCount,
        inserted: payload.inserted,
        updated: payload.updated,
        commit: payload.commit
      });

      if (commit) {
        window.location.reload();
      }
    } catch {
      setError('Import failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveNote() {
    if (!selectedMemberId || !noteText.trim()) {
      setNoteError('Member and note are required.');
      return;
    }

    setIsSavingNote(true);
    setNoteError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/members/${selectedMemberId}/notes`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ noteText })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setNoteError(payload.error ?? 'Failed to save note.');
        return;
      }

      setNoteText('');
      window.location.reload();
    } catch {
      setNoteError('Failed to save note.');
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Membership paste import</h2>
        <p className="text-sm text-muted-foreground">Paste plain text with one member per line: Name, Email, Phone.</p>
        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          className="min-h-44 w-full rounded-md border bg-background p-3 text-sm"
          placeholder="Jane Doe, jane@example.com, 801-555-0101"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => submitImport(false)} disabled={isSubmitting}>
            Dry run preview
          </Button>
          <Button type="button" onClick={() => submitImport(true)} disabled={isSubmitting}>
            Commit import
          </Button>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {summary ? (
          <p className="text-sm text-muted-foreground">
            {summary.commit ? 'Commit complete.' : 'Preview complete.'} Parsed {summary.parsedCount} members
            {summary.commit ? ` (${summary.inserted} inserted, ${summary.updated} updated).` : '.'}
          </p>
        ) : null}
        {preview.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item) => (
                  <tr key={item.fullName} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium">{item.fullName}</td>
                    <td className="px-3 py-2">{item.email ?? '—'}</td>
                    <td className="px-3 py-2">{item.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Member notes</h2>
        <p className="text-sm text-muted-foreground">Restricted internal notes for membership follow-up.</p>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="member-id">
            Member
          </label>
          <select
            id="member-id"
            value={selectedMemberId}
            onChange={(event) => setSelectedMemberId(event.target.value)}
            className="w-full rounded-md border bg-background p-2 text-sm"
          >
            <option value="">Select member</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="member-note">
            Note
          </label>
          <textarea
            id="member-note"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
            placeholder="Add a restricted member note"
          />
        </div>

        <Button type="button" onClick={saveNote} disabled={isSavingNote || !members.length}>
          Add note
        </Button>
        {noteError ? <p className="text-sm text-red-600">{noteError}</p> : null}

        <div className="space-y-3">
          {members.length ? (
            members.map((member) => {
              const notes = notesByMemberId[member.id] ?? [];
              return (
                <article key={member.id} className="rounded-md border p-3">
                  <h3 className="font-semibold">{member.full_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {member.email ?? 'No email'} · {member.phone ?? 'No phone'}
                  </p>
                  {notes.length ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {notes.map((note) => (
                        <li key={note.id} className="rounded bg-muted/50 px-2 py-1">
                          {note.note_text}
                          <span className="ml-2 text-xs text-muted-foreground">({note.created_by_email ?? 'Unknown'})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No notes yet.</p>
                  )}
                </article>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">No members imported yet. Commit a membership import first.</p>
          )}
        </div>
      </section>
    </div>
  );
}
