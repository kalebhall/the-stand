'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';

import {
  defaultIntroductionRoles,
  isHymnItem,
  type EditorProgramItem,
  type PatchProgramItemRequest,
  type ProgramItemsResponse
} from '@/src/meetings/program-item-contracts';
import { getProgramItemLabel } from '@/src/meetings/types';
import { getPublicProgramRenderLabels } from '@/src/i18n/public-program';
import { resolveLocale } from '@/src/i18n/config';

type Props = {
  wardId: string;
  meetingId: string;
  canEditProgramNotes: boolean;
  onSaved?: () => void;
};

type RowState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
type Conflict = { itemId: string; items: EditorProgramItem[]; sourceRevision: string };

const introductionRoles: Array<{ key: 'presiding' | 'conducting' | 'organist' | 'chorister'; label: string }> = [
  { key: 'presiding', label: 'presiding' },
  { key: 'conducting', label: 'conducting' },
  { key: 'organist', label: 'organistPianist' },
  { key: 'chorister', label: 'chorister' }
];

function nullable(value: string): string | null {
  return value.trim() ? value : null;
}

function itemLabel(item: EditorProgramItem, t: ReturnType<typeof useTranslations<'programs'>>, itemLabels: Record<string, string>): string {
  if (item.itemType.toUpperCase() === 'INTRODUCTION') return t('introduction');
  if (item.itemType.toUpperCase() === 'ANNOUNCEMENT') return t('announcements');
  return item.title?.trim() || itemLabels[item.itemType.toUpperCase()] || getProgramItemLabel(item.itemType);
}

function sameNullable(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left?.trim() || null) === (right?.trim() || null);
}

export function ProgramEntriesEditor({ wardId, meetingId, canEditProgramNotes, onSaved }: Props) {
  const t = useTranslations('programs');
  const locale = useLocale();
  const publicLabels = getPublicProgramRenderLabels(resolveLocale(locale), 'SACRAMENT');
  const [items, setItems] = useState<EditorProgramItem[]>([]);
  const [savedItems, setSavedItems] = useState<EditorProgramItem[]>([]);
  const [sourceRevision, setSourceRevision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/program-items`, { cache: 'no-store' });
      const body = (await response.json()) as Partial<ProgramItemsResponse> & { error?: string };
      if (!response.ok || !body.items || !body.sourceRevision) throw new Error(body.error ?? t('failedLoadProgramEntries'));
      setItems(body.items);
      setSavedItems(body.items);
      setSourceRevision(body.sourceRevision);
      setConflict(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : t('failedLoadProgramEntries'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [meetingId, wardId]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function updateItem(itemId: string, changes: Partial<EditorProgramItem>) {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...changes } : item)));
  }

  function patchesFor(item: EditorProgramItem, original: EditorProgramItem): PatchProgramItemRequest['patch'][] {
    if (!canEditProgramNotes || sameNullable(item.programNotes, original.programNotes)) return [];
    return [{ kind: 'TEXT', field: 'programNotes', value: nullable(item.programNotes ?? '') }];
  }

  async function saveItem(itemId: string) {
    const item = itemById.get(itemId);
    const original = savedItems.find((candidate) => candidate.id === itemId);
    if (!item || !original || item.sourceState === 'MANAGED' || !sourceRevision) return;
    const patches = patchesFor(item, original);
    if (!patches.length) {
      setRowStates((current) => ({ ...current, [itemId]: 'saved' }));
      return;
    }

    setSavingId(itemId);
    setRowStates((current) => ({ ...current, [itemId]: 'saving' }));
    let nextItems = items;
    let nextSavedItems = savedItems;
    let nextRevision = sourceRevision;
    try {
      for (const patch of patches) {
        const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/program-items/${itemId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedRevision: nextRevision, patch })
        });
        const body = (await response.json()) as {
          sourceRevision?: string;
          items?: EditorProgramItem[];
          current?: ProgramItemsResponse;
          error?: string;
        };
        if (response.status === 409 && body.current) {
          setConflict({ itemId, items: body.current.items, sourceRevision: body.current.sourceRevision });
          setRowStates((current) => ({ ...current, [itemId]: 'conflict' }));
          return;
        }
        if (!response.ok || !body.items || !body.sourceRevision) throw new Error(body.error ?? t('saveProgramEntryFailed'));
        nextItems = body.items;
        nextSavedItems = body.items;
        nextRevision = body.sourceRevision;
        setItems(nextItems);
        setSavedItems(nextSavedItems);
        setSourceRevision(nextRevision);
        onSaved?.();
      }
      setItems(nextItems);
      setSavedItems(nextSavedItems);
      setSourceRevision(nextRevision);
      setRowStates((current) => ({ ...current, [itemId]: 'saved' }));
      onSaved?.();
    } catch (error: unknown) {
      setRowStates((current) => ({ ...current, [itemId]: 'error' }));
      setLoadError(error instanceof Error ? error.message : t('saveProgramEntryFailed'));
    } finally {
      setSavingId(null);
    }
  }

  if (loading)
    return (
      <section aria-label={t('programContent')} className="rounded-xl border bg-card p-5">
        <p role="status">{t('loadingProgramEntries')}</p>
      </section>
    );
  if (loadError && !items.length)
    return (
      <section aria-label={t('programContent')} className="space-y-3 rounded-xl border bg-card p-5">
        <p role="alert">{loadError}</p>
        <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void load()}>
          {t('retryLoadProgramEntries')}
        </button>
      </section>
    );

  return (
    <section aria-label={t('programContent')} className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <header className="space-y-1 border-b pb-4">
        <h2 className="text-xl font-semibold">{t('programContent')}</h2>
        <p className="text-sm text-muted-foreground">{t('programContentDescription')}</p>
        <p className="text-sm text-amber-900">{t('programNotesDisclaimer')}</p>
      </header>
      {loadError ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {loadError}
        </p>
      ) : null}
      {conflict ? (
        <section role="alert" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p>{t('programChangedElsewhere')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border px-3 py-2"
              onClick={() => {
                setItems(conflict.items);
                setSavedItems(conflict.items);
                setSourceRevision(conflict.sourceRevision);
                setConflict(null);
                setRowStates((current) => ({ ...current, [conflict.itemId]: 'idle' }));
              }}
            >
              {t('useServerProgram')}
            </button>
            <button
              type="button"
              className="rounded border px-3 py-2"
              onClick={() => {
                setSavedItems(conflict.items);
                setSourceRevision(conflict.sourceRevision);
                setConflict(null);
                setRowStates((current) => ({ ...current, [conflict.itemId]: 'idle' }));
              }}
            >
              {t('keepLocalProgram')}
            </button>
          </div>
        </section>
      ) : null}
      <div className="space-y-3">
        {items.map((item) => {
          const roles = item.introductionRoles ?? defaultIntroductionRoles(null);
          const state = rowStates[item.id] ?? 'idle';
          const locked = item.sourceState === 'MANAGED' || savingId !== null;
          const programNotesDisabled = locked || !canEditProgramNotes;
          const original = savedItems.find((candidate) => candidate.id === item.id);
          const programNotesChanged = !!original && !sameNullable(item.programNotes, original.programNotes);
          return (
            <article
              key={item.id}
              aria-label={`${item.sequence}. ${itemLabel(item, t, publicLabels.itemLabels)}`}
              className="space-y-3 rounded-lg border bg-background p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('programEntryNumber', { number: item.sequence })}
                  </p>
                  <h3 className="text-lg font-semibold">{itemLabel(item, t, publicLabels.itemLabels)}</h3>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {item.sourceState === 'MANAGED' ? (
                    <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
                      {item.itemType.toUpperCase() === 'ANNOUNCEMENT' ? t('managedByAnnouncements') : t('managedByAtStand')}
                    </span>
                  ) : state === 'saving' ? (
                    <span role="status">{t('savingProgramEntry')}</span>
                  ) : state === 'saved' ? (
                    <span role="status" className="text-green-700">
                      {t('programEntrySaved')}
                    </span>
                  ) : state === 'conflict' ? (
                    <span role="status" className="text-amber-800">
                      {t('conflictNeedsReview')}
                    </span>
                  ) : state === 'error' ? (
                    <span role="status" className="text-red-700">
                      {t('programEntrySaveFailed')}
                    </span>
                  ) : null}
                </div>
              </div>
              {item.sourceState === 'MANAGED' ? (
                <p className="text-sm text-muted-foreground">
                  {item.itemType.toUpperCase() === 'ANNOUNCEMENT'
                    ? t('managedByAnnouncementsDescription')
                    : t('managedByAtStandDescription')}{' '}
                  <Link className="font-medium text-primary underline" href={item.managedHref ?? '/meetings'}>
                    {item.itemType.toUpperCase() === 'ANNOUNCEMENT' ? t('openAnnouncements') : t('openMeetings')}
                  </Link>
                </p>
              ) : null}
              {item.sourceState === 'MANAGED' ? null : (
                <>
                  {item.itemType.toUpperCase() === 'INTRODUCTION' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {introductionRoles.map((role) => (
                        <div key={`${item.id}:${role.key}`} className="space-y-1 text-sm">
                          <span className="text-muted-foreground">{t(role.label)}</span>
                          <p className="font-medium">{roles[role.key].trim() || '—'}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 text-sm">
                      <span>{t('entryTitle')}</span>
                      <p className="font-medium">{item.title?.trim() || '—'}</p>
                    </div>
                    {item.itemType.toUpperCase() === 'SPEAKER' ? (
                      <div className="space-y-1 text-sm">
                        <span>{t('speakerTopic')}</span>
                        <p className="font-medium">{item.topic?.trim() || '—'}</p>
                      </div>
                    ) : null}
                  </div>
                  {isHymnItem(item.itemType) ? (
                    <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                      <div className="space-y-1 text-sm">
                        <span>{t('hymnNumber')}</span>
                        <p className="font-medium">{item.hymnNumber?.trim() || '—'}</p>
                      </div>
                      <div className="space-y-1 text-sm">
                        <span>{t('hymnTitle')}</span>
                        <p className="font-medium">{item.hymnTitle?.trim() || '—'}</p>
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-1 text-sm">
                    <span>{t('programNotes')}</span>
                    {canEditProgramNotes ? (
                      <textarea
                        aria-label={t('programNotes')}
                        className="min-h-20 w-full rounded-md border px-3 py-2"
                        value={item.programNotes ?? ''}
                        disabled={programNotesDisabled}
                        onChange={(event) => updateItem(item.id, { programNotes: event.target.value })}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap font-medium">{item.programNotes?.trim() || '—'}</p>
                    )}
                    {canEditProgramNotes ? <span className="text-xs text-amber-900">{t('programNotesDisclaimer')}</span> : null}
                  </div>
                  {canEditProgramNotes ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={locked || !programNotesChanged}
                        onClick={() => void saveItem(item.id)}
                      >
                        {state === 'error' ? t('retryProgramEntry') : t('saveProgramEntry')}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
