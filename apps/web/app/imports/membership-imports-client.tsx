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
  organization: string | null;
  calling_name: string;
  sustained: boolean;
  set_apart: boolean;
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
  birthday: string;
  organization: string;
  callingName: string;
  sustained: boolean;
  setApart: boolean;
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

  const [callingPdfFile, setCallingPdfFile] = useState<File | null>(null);
  const [callingPreview, setCallingPreview] = useState<PreviewCalling[]>([]);
  const [callingSummary, setCallingSummary] = useState<{
    parsedCount: number;
    inserted: number;
    replacedCount: number;
    matchedMembers: number;
    unmatchedMembers: number;
    commit: boolean;
    stale: CallingDrift;
  } | null>(null);
  const [callingError, setCallingError] = useState<string | null>(null);
  const [isCallingSubmitting, setIsCallingSubmitting] = useState(false);

  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingMemberNoteId, setIsSavingMemberNoteId] = useState<string | null>(null);
  const [isDeletingMemberId, setIsDeletingMemberId] = useState<string | null>(null);
  const [isDeletingCallingId, setIsDeletingCallingId] = useState<string | null>(null);

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
      const formData = new FormData();
      formData.set('commit', commit ? 'true' : 'false');
      if (callingPdfFile) {
        formData.set('file', callingPdfFile);
      }

      const response = await fetch(`/api/w/${wardId}/imports/callings`, {
        method: 'POST',
        body: formData
      });

      const payload = (await response.json()) as
        | {
            preview: PreviewCalling[];
            parsedCount: number;
            inserted: number;
            replacedCount: number;
            matchedMembers: number;
            unmatchedMembers: number;
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
        inserted: payload.inserted,
        replacedCount: payload.replacedCount,
        matchedMembers: payload.matchedMembers,
        unmatchedMembers: payload.unmatchedMembers,
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
        <h2 className="text-lg font-semibold">Calling PDF import</h2>
        <p className="text-sm text-muted-foreground">Upload a PDF generated from Members with Callings. Import replaces all current callings.</p>

        <div className={`rounded-md border px-3 py-2 text-sm ${drift.isStale ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
          Drift indicator: {drift.isStale ? `Stale (${drift.driftCount} changes since last committed calling import).` : 'In sync with latest committed calling import.'}
        </div>

        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => setCallingPdfFile(event.target.files?.[0] ?? null)}
          className="w-full rounded-md border bg-background p-2 text-sm"
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
            {callingSummary.commit ? 'Commit complete.' : 'Preview complete.'} Parsed {callingSummary.parsedCount} rows.
            {callingSummary.commit
              ? ` ${callingSummary.replacedCount} previous callings replaced, ${callingSummary.inserted} inserted, ${callingSummary.matchedMembers} matched to members, ${callingSummary.unmatchedMembers} unmatched.`
              : ''}
          </p>
        ) : null}

        {callingPreview.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left">Member</th>
                  <th className="px-3 py-2 text-left">Birth Date</th>
                  <th className="px-3 py-2 text-left">Organization</th>
                  <th className="px-3 py-2 text-left">Calling</th>
                  <th className="px-3 py-2 text-left">Sustained</th>
                  <th className="px-3 py-2 text-left">Set Apart</th>
                </tr>
              </thead>
              <tbody>
                {callingPreview.map((item) => (
                  <tr key={`${item.memberName}-${item.birthday}-${item.callingName}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium">{item.memberName}</td>
                    <td className="px-3 py-2">{item.birthday}</td>
                    <td className="px-3 py-2">{item.organization}</td>
                    <td className="px-3 py-2">{item.callingName}</td>
                    <td className="px-3 py-2">{item.sustained ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">{item.setApart ? 'Yes' : 'No'}</td>
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
                    <span className="ml-2 text-xs text-muted-foreground">{assignment.organization ?? '—'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{assignment.is_active ? 'Active' : 'Released'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">Sustained: {assignment.sustained ? 'Yes' : 'No'}</span>
                    <span className="ml-2 text-xs text-muted-foreground">Set Apart: {assignment.set_apart ? 'Yes' : 'No'}</span>
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
        {noteError ? <p className="text-sm text-red-600">{noteError}</p> : null}

        <div className="space-y-3">
          {members.length ? (
            members.map((member) => {
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
                  <div className="mt-3 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor={`member-note-${member.id}`}>
                      Note
                    </label>
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
                        void saveMemberNote(member.id);
                      }}
                      className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                      placeholder="Add a restricted member note"
                    />
                    <p className="text-xs text-muted-foreground">
                      {isSavingMemberNoteId === member.id ? 'Saving…' : 'Changes save when this field loses focus.'}
                    </p>
                  </div>
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
