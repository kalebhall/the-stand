'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import type { NoteTarget, NoteVisibility } from '@/src/notes/types';
import { formatDateTimeForDisplay } from '@/src/meetings/date';

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

export function InternalNotesPanel({ wardId, target, notes, title }: InternalNotesPanelProps) {
  const t = useTranslations('notes');
  title ??= t('internalNotes');
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
        setError(payload.detail ?? payload.error ?? t('saveFailed'));
        return;
      }
      window.location.reload();
    } catch {
      setError(t('saveFailed'));
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
        setError(payload?.error ?? t('updateFailed'));
        return;
      }
      window.location.reload();
    } catch {
      setError(t('updateFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (!showPanel) {
    return (
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={() => setAudiencePickerOpen(true)}>
          {t('add')}
        </Button>
      </div>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setAudiencePickerOpen(true)}>
          {t('add')}
        </Button>
      </div>

      {audiencePickerOpen ? (
        <div className="mt-3 rounded-md border bg-background p-3" role="group" aria-label={t('chooseAudience')}>
          <p className="text-sm font-medium">{t('whoCanSee')}</p>
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
                  <strong className="block">{t('publicProgram')}</strong>
                  <span className="text-xs text-muted-foreground">{t('shownOnPublished')}</span>
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
                <strong className="block">{t('bishopricClerk')}</strong>
                <span className="text-xs text-muted-foreground">{t('authorizedLeaders')}</span>
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
                <strong className="block">{t('personal')}</strong>
                <span className="text-xs text-muted-foreground">{t('onlyYou')}</span>
              </span>
            </Button>
          </div>
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setAudiencePickerOpen(false)}>
            {t('cancel')}
          </Button>
        </div>
      ) : null}

      {selectedVisibility ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">
            {selectedVisibility === 'PUBLIC'
              ? t('publicWarning')
              : selectedVisibility === 'LEADERSHIP'
                ? t('leadershipWarning')
                : t('personalWarning')}
          </p>
          <textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t('write')}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void saveNote()} disabled={saving || !noteText.trim()}>
              {saving ? t('saving') : t('saveNote')}
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
              {t('cancel')}
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
                  {note.visibility === 'PUBLIC' ? t('publicProgram') : note.visibility === 'PRIVATE' ? t('personal') : t('bishopricClerk')}
                </span>
                <span>
                  {note.created_by_email ?? t('unknownAuthor')} · {formatDateTimeForDisplay(note.created_at)}
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
                      {t('save')}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingNoteId(null)} disabled={saving}>
                      {t('cancel')}
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
                    {t('edit')}
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
