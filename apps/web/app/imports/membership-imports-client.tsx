'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

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

type CallingRow = {
  id: string;
  member_name: string;
  calling_name: string;
  is_active: boolean;
};

type PreviewMember = {
  fullName: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  birthday: string | null;
  gender: string | null;
};

type PreviewCalling = {
  memberName: string;
  callingName: string;
  isRelease: boolean;
};

type CallingDrift = {
  isStale: boolean;
  driftCount: number;
  comparedToImportRunId: string | null;
};

export function MembershipImportsClient({
  wardId,
  members,
  memberNotes,
  callingAssignments,
  initialCallingDrift
}: {
  wardId: string;
  members: MemberRow[];
  memberNotes: MemberNoteRow[];
  callingAssignments: CallingRow[];
  initialCallingDrift: CallingDrift;
}) {
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<PreviewMember[]>([]);
  const [summary, setSummary] = useState<{ parsedCount: number; inserted: number; updated: number; commit: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [callingRawText, setCallingRawText] = useState('');
  const [callingPreview, setCallingPreview] = useState<PreviewCalling[]>([]);
  const [callingSummary, setCallingSummary] = useState<{
    parsedCount: number;
    activeCount: number;
    releaseCount: number;
    inserted: number;
    reactivated: number;
    releasesApplied: number;
    commit: boolean;
    stale: CallingDrift;
  } | null>(null);
  const [callingError, setCallingError] = useState<string | null>(null);
  const [isCallingSubmitting, setIsCallingSubmitting] = useState(false);

  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '');
  const [noteText, setNoteText] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [isSavingEditedNote, setIsSavingEditedNote] = useState(false);
  const [isDeletingNoteId, setIsDeletingNoteId] = useState<string | null>(null);
  const [isDeletingMemberId, setIsDeletingMemberId] = useState<string | null>(null);
  const [isDeletingCallingId, setIsDeletingCallingId] = useState<string | null>(null);

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
        setError('error' in payload ? (payload.error ?? 'Import failed') : 'Import failed');
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

  async function submitCallingImport(commit: boolean) {
    setIsCallingSubmitting(true);
    setCallingError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/imports/callings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ rawText: callingRawText, commit })
      });

      const payload = (await response.json()) as
        | {
            preview: PreviewCalling[];
            parsedCount: number;
            activeCount: number;
            releaseCount: number;
            inserted: number;
            reactivated: number;
            releasesApplied: number;
            stale: CallingDrift;
            commit: boolean;
          }
        | { error?: string };

      if (!response.ok || !('preview' in payload)) {
        setCallingError('error' in payload ? (payload.error ?? 'Calling import failed') : 'Calling import failed');
        return;
      }

      setCallingPreview(payload.preview);
      setCallingSummary({
        parsedCount: payload.parsedCount,
        activeCount: payload.activeCount,
        releaseCount: payload.releaseCount,
        inserted: payload.inserted,
        reactivated: payload.reactivated,
        releasesApplied: payload.releasesApplied,
        stale: payload.stale,
        commit: payload.commit
      });

      if (commit) {
        window.location.reload();
      }
    } catch {
      setCallingError('Calling import failed');
    } finally {
      setIsCallingSubmitting(false);
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

  async function saveEditedNote(memberId: string) {
    if (!editingNoteId || !editingNoteText.trim()) {
      setNoteError('Note text is required.');
      return;
    }

    setIsSavingEditedNote(true);
    setNoteError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/members/${memberId}/notes/${editingNoteId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ noteText: editingNoteText })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setNoteError(payload.error ?? 'Failed to edit note.');
        return;
      }

      setEditingNoteId(null);
      setEditingNoteText('');
      window.location.reload();
    } catch {
      setNoteError('Failed to edit note.');
    } finally {
      setIsSavingEditedNote(false);
    }
  }

  async function deleteNote(memberId: string, noteId: string) {
    if (!window.confirm('Delete this note?')) {
      return;
    }

    setIsDeletingNoteId(noteId);
    setNoteError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/members/${memberId}/notes/${noteId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setNoteError(payload.error ?? 'Failed to delete note.');
        return;
      }

      window.location.reload();
    } catch {
      setNoteError('Failed to delete note.');
    } finally {
      setIsDeletingNoteId(null);
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

  async function deleteCalling(callingId: string) {
    if (!window.confirm('Delete this calling assignment?')) {
      return;
    }

    setIsDeletingCallingId(callingId);
    setCallingError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/callings/${callingId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setCallingError(payload.error ?? 'Failed to delete calling.');
        return;
      }

      window.location.reload();
    } catch {
      setCallingError('Failed to delete calling.');
    } finally {
      setIsDeletingCallingId(null);
    }
  }

  const drift = callingSummary?.stale ?? initialCallingDrift;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Membership paste import</h2>
        <p className="text-sm text-muted-foreground">Paste member data with a header row (tab-delimited preferred: Name, Email, Phone, Age, Birthday, Gender). The header determines field mapping.</p>
        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          className="min-h-44 w-full rounded-md border bg-background p-3 text-sm"
          placeholder={"Name\tEmail\tPhone\tAge\tBirthday\tGender\nJane Doe\tjane@example.com\t801-555-0101\t35\tJan 15\tFemale"}
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
                  <th className="px-3 py-2 text-left">Age</th>
                  <th className="px-3 py-2 text-left">Birthday</th>
                  <th className="px-3 py-2 text-left">Gender</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item) => (
                  <tr key={item.fullName} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium">{item.fullName}</td>
                    <td className="px-3 py-2">{item.email ?? '—'}</td>
                    <td className="px-3 py-2">{item.phone ?? '—'}</td>
                    <td className="px-3 py-2">{item.age ?? '—'}</td>
                    <td className="px-3 py-2">{item.birthday ?? '—'}</td>
                    <td className="px-3 py-2">{item.gender ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Calling paste import</h2>
        <p className="text-sm text-muted-foreground">Paste plain text callings with one assignment per line. Prefix releases with “Release:”.</p>

        <div className={`rounded-md border px-3 py-2 text-sm ${drift.isStale ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
          Drift indicator: {drift.isStale ? `Stale (${drift.driftCount} changes since last committed calling import).` : 'In sync with latest committed calling import.'}
        </div>

        <textarea
          value={callingRawText}
          onChange={(event) => setCallingRawText(event.target.value)}
          className="min-h-44 w-full rounded-md border bg-background p-3 text-sm"
          placeholder={"John Doe\tElders Quorum President\nRelease: Jane Doe\tRelief Society President"}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => submitCallingImport(false)} disabled={isCallingSubmitting}>
            Dry run preview
          </Button>
          <Button type="button" onClick={() => submitCallingImport(true)} disabled={isCallingSubmitting}>
            Commit import
          </Button>
        </div>

        {callingError ? <p className="text-sm text-red-600">{callingError}</p> : null}

        {callingSummary ? (
          <p className="text-sm text-muted-foreground">
            {callingSummary.commit ? 'Commit complete.' : 'Preview complete.'} Parsed {callingSummary.parsedCount} rows ({callingSummary.activeCount}{' '}
            active, {callingSummary.releaseCount} releases).
            {callingSummary.commit
              ? ` ${callingSummary.inserted} inserted, ${callingSummary.reactivated} reactivated, ${callingSummary.releasesApplied} releases applied.`
              : ''}
          </p>
        ) : null}

        {callingPreview.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left">Member</th>
                  <th className="px-3 py-2 text-left">Calling</th>
                  <th className="px-3 py-2 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {callingPreview.map((item) => (
                  <tr key={`${item.memberName}-${item.callingName}-${item.isRelease ? 'release' : 'sustain'}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium">{item.memberName}</td>
                    <td className="px-3 py-2">{item.callingName}</td>
                    <td className="px-3 py-2">{item.isRelease ? 'Release' : 'Sustain'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Current calling assignments</h3>
          {callingAssignments.length ? (
            <ul className="space-y-1 text-sm">
              {callingAssignments.map((assignment) => (
                <li key={assignment.id} className="flex items-center justify-between gap-3 rounded border px-2 py-1">
                  <div>
                    <span className="font-medium">{assignment.member_name}</span> — {assignment.calling_name}
                    <span className="ml-2 text-xs text-muted-foreground">{assignment.is_active ? 'Active' : 'Released'}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => deleteCalling(assignment.id)}
                    disabled={isDeletingCallingId === assignment.id}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No calling assignments yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 lg:col-span-2">
        <h2 className="text-lg font-semibold">Members & notes</h2>
        <p className="text-sm text-muted-foreground">Manage members and restricted internal notes for membership follow-up.</p>

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
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{member.full_name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {member.email ?? 'No email'} · {member.phone ?? 'No phone'}
                        {member.age != null ? ` · Age ${member.age}` : ''}
                        {member.birthday ? ` · ${member.birthday}` : ''}
                        {member.gender ? ` · ${member.gender}` : ''}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => deleteMember(member.id)}
                      disabled={isDeletingMemberId === member.id}
                    >
                      Delete member
                    </Button>
                  </div>
                  {notes.length ? (
                    <ul className="mt-2 space-y-2 text-sm">
                      {notes.map((note) => (
                        <li key={note.id} className="rounded bg-muted/50 px-2 py-2">
                          {editingNoteId === note.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingNoteText}
                                onChange={(event) => setEditingNoteText(event.target.value)}
                                className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                              />
                              <div className="flex gap-2">
                                <Button type="button" size="sm" onClick={() => saveEditedNote(member.id)} disabled={isSavingEditedNote}>
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditingNoteText('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                {note.note_text}
                                <span className="ml-2 text-xs text-muted-foreground">({note.created_by_email ?? 'Unknown'})</span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingNoteId(note.id);
                                    setEditingNoteText(note.note_text);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteNote(member.id, note.id)}
                                  disabled={isDeletingNoteId === note.id}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          )}
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
