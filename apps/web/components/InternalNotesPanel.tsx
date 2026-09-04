'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { NoteTarget, NoteVisibility } from '@/src/notes/types';

export type InternalNoteRow = {
  id: string;
  visibility: NoteVisibility;
  note_text: string;
  created_at: string;
  created_by_email: string | null;
  program_item_id?: string;
};

type InternalNotesPanelProps = {
  wardId: string;
  target: NoteTarget;
  notes: InternalNoteRow[];
  title?: string;
};

export function InternalNotesPanel({ wardId, target, notes, title = 'Notes' }: InternalNotesPanelProps) {
  const [selectedVisibility, setSelectedVisibility] = useState<NoteVisibility | null>(null);
  const [audiencePickerOpen, setAudiencePickerOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const showPanel = notes.length > 0 || audiencePickerOpen || selectedVisibility !== null || error !== null;

  async function saveNote() {
    const text = noteText.trim();
    if (!selectedVisibility || !text) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, visibility: selectedVisibility, noteText: text })
      });
      const payload = (await response.json()) as { error?: string; detail?: string };
      if (!response.ok) {
        setError(payload.detail ?? payload.error ?? 'Failed to save note.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Failed to save note.');
    } finally {
      setSaving(false);
    }
  }

  async function updateNote(noteId: string) {
    const text = editingText.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ noteText: text })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'Failed to update note.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Failed to update note.');
    } finally {
      setSaving(false);
    }
  }

  if (!showPanel) {
    return (
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={() => setAudiencePickerOpen(true)}>
          Add note
        </Button>
      </div>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setAudiencePickerOpen(true)}>
          Add note
        </Button>
      </div>

      {audiencePickerOpen ? (
        <div className="mt-3 rounded-md border bg-background p-3" role="group" aria-label="Choose note audience">
          <p className="text-sm font-medium">Who can see this note?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {target.type === 'PROGRAM_ITEM' ? (
              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start whitespace-normal p-3 text-left"
                onClick={() => {
                  setSelectedVisibility('PUBLIC');
                  setAudiencePickerOpen(false);
                }}
              >
                <span>
                  <strong className="block">Public program</strong>
                  <span className="text-xs text-muted-foreground">Shown on published program</span>
                </span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start whitespace-normal p-3 text-left"
              onClick={() => {
                setSelectedVisibility('LEADERSHIP');
                setAudiencePickerOpen(false);
              }}
            >
              <span>
                <strong className="block">Bishopric / clerk</strong>
                <span className="text-xs text-muted-foreground">Authorized ward leaders</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start whitespace-normal p-3 text-left"
              onClick={() => {
                setSelectedVisibility('PRIVATE');
                setAudiencePickerOpen(false);
              }}
            >
              <span>
                <strong className="block">Personal</strong>
                <span className="text-xs text-muted-foreground">Only you</span>
              </span>
            </Button>
          </div>
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setAudiencePickerOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {selectedVisibility ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">
            {selectedVisibility === 'PUBLIC'
              ? 'This note appears on the published public program. Do not include private information.'
              : selectedVisibility === 'LEADERSHIP'
                ? 'Visible only to authorized bishopric and clerk roles in this ward.'
                : 'Visible only to you.'}
          </p>
          <textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
            placeholder="Write note…"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void saveNote()} disabled={saving || !noteText.trim()}>
              {saving ? 'Saving…' : 'Save note'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedVisibility(null);
                setNoteText('');
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {notes.length ? (
        <ul className="mt-4 space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md border bg-background p-3 text-sm">
              <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {note.visibility === 'PUBLIC' ? 'Public program' : note.visibility === 'PRIVATE' ? 'Personal' : 'Bishopric / Clerk'}
                </span>
                <span>
                  {note.created_by_email ?? 'Unknown author'} · {new Date(note.created_at).toLocaleString()}
                </span>
              </div>
              {editingNoteId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editingText}
                    onChange={(event) => setEditingText(event.target.value)}
                    className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => void updateNote(note.id)} disabled={saving || !editingText.trim()}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingNoteId(null)} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">{note.note_text}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-7 px-2"
                    onClick={() => {
                      setEditingNoteId(note.id);
                      setEditingText(note.note_text);
                    }}
                  >
                    Edit
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
