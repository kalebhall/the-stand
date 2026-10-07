'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';

import {
  defaultIntroductionRoles,
  isHymnItem,
  type EditorProgramItem,
  type IntroductionRole,
  type PatchProgramItemRequest,
  type ProgramItemsResponse
} from '@/src/meetings/program-item-contracts';
import { getProgramItemLabel, type VisitingLeaderType } from '@/src/meetings/types';
import { getPublicProgramRenderLabels } from '@/src/i18n/public-program';
import { resolveLocale } from '@/src/i18n/config';

type Props = {
  wardId: string;
  meetingId: string;
  onSaved?: () => void;
};

type RowState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
type Conflict = { itemId: string; items: EditorProgramItem[]; sourceRevision: string };

const introductionRoles: Array<{ key: IntroductionRole; label: string }> = [
  { key: 'presiding', label: 'presiding' },
  { key: 'conducting', label: 'conducting' },
  { key: 'organist', label: 'organistPianist' },
  { key: 'chorister', label: 'chorister' }
];

const visitingLeaderTypes: Array<{
  value: VisitingLeaderType;
  label:
    | 'visitingLeaderTypePresidingAuthority'
    | 'visitingLeaderTypeHighCouncilor'
    | 'visitingLeaderTypeGeneralOfficer'
    | 'visitingLeaderTypeOther';
}> = [
  { value: 'PRESIDING_AUTHORITY', label: 'visitingLeaderTypePresidingAuthority' },
  { value: 'HIGH_COUNCILOR', label: 'visitingLeaderTypeHighCouncilor' },
  { value: 'GENERAL_OFFICER', label: 'visitingLeaderTypeGeneralOfficer' },
  { value: 'OTHER', label: 'visitingLeaderTypeOther' }
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

type ProgramItemPatch = PatchProgramItemRequest['patch'];

function patchAcknowledgesText(patch: ProgramItemPatch, field: 'title' | 'topic' | 'notes' | 'programNotes'): boolean {
  return patch.kind === 'TEXT' && patch.field === field;
}

function mergeAcknowledgedIntroductionRoles(
  serverItem: EditorProgramItem,
  localItem: EditorProgramItem,
  baselineItem: EditorProgramItem,
  patch: ProgramItemPatch
): EditorProgramItem['introductionRoles'] {
  if (patch.kind === 'INTRODUCTION_ROLES') return serverItem.introductionRoles;

  const serverRoles = serverItem.introductionRoles ?? defaultIntroductionRoles(null);
  const localRoles = localItem.introductionRoles ?? defaultIntroductionRoles(null);
  const baselineRoles = baselineItem.introductionRoles ?? defaultIntroductionRoles(null);
  const mergedRoles = { ...serverRoles };

  for (const role of introductionRoles) {
    if (patch.kind === 'INTRODUCTION_ROLE' && patch.role === role.key) continue;
    if (!sameNullable(localRoles[role.key], baselineRoles[role.key])) mergedRoles[role.key] = localRoles[role.key];
  }
  if (JSON.stringify(localRoles.visitingLeaders ?? []) !== JSON.stringify(baselineRoles.visitingLeaders ?? [])) {
    mergedRoles.visitingLeaders = localRoles.visitingLeaders;
  }
  return mergedRoles;
}

function mergeSavedRowResponse(
  serverItems: EditorProgramItem[],
  localItems: EditorProgramItem[],
  baselineItems: EditorProgramItem[],
  savedItemId: string,
  acknowledgedPatch: ProgramItemPatch
): EditorProgramItem[] {
  return serverItems.map((serverItem) => {
    const isSavedItem = serverItem.id === savedItemId;
    const localItem = localItems.find((candidate) => candidate.id === serverItem.id);
    const baselineItem = baselineItems.find((candidate) => candidate.id === serverItem.id);
    if (!localItem || !baselineItem) return serverItem;
    const mergedItem = { ...serverItem };
    for (const field of ['title', 'topic', 'notes', 'programNotes'] as const) {
      if ((!isSavedItem || !patchAcknowledgesText(acknowledgedPatch, field)) && !sameNullable(localItem[field], baselineItem[field])) {
        mergedItem[field] = localItem[field];
      }
    }
    if (!isSavedItem || acknowledgedPatch.kind !== 'HYMN') {
      if (!sameNullable(localItem.hymnNumber, baselineItem.hymnNumber)) mergedItem.hymnNumber = localItem.hymnNumber;
      if (!sameNullable(localItem.hymnTitle, baselineItem.hymnTitle)) mergedItem.hymnTitle = localItem.hymnTitle;
      if (localItem.hymnLocale !== baselineItem.hymnLocale) mergedItem.hymnLocale = localItem.hymnLocale;
    }
    if (serverItem.itemType.toUpperCase() === 'INTRODUCTION') {
      mergedItem.introductionRoles = isSavedItem
        ? mergeAcknowledgedIntroductionRoles(serverItem, localItem, baselineItem, acknowledgedPatch)
        : localItem.introductionRoles;
    }
    return mergedItem;
  });
}

function mergeSavedBaseline(
  serverItems: EditorProgramItem[],
  baselineItems: EditorProgramItem[],
  savedItemId: string,
  acknowledgedPatch: ProgramItemPatch
): EditorProgramItem[] {
  return serverItems.map((serverItem) => {
    const baselineItem = baselineItems.find((candidate) => candidate.id === serverItem.id);
    if (serverItem.id !== savedItemId || !baselineItem) return baselineItem ?? serverItem;
    const mergedItem = { ...baselineItem };
    if (acknowledgedPatch.kind === 'TEXT') mergedItem[acknowledgedPatch.field] = serverItem[acknowledgedPatch.field];
    if (acknowledgedPatch.kind === 'HYMN') {
      mergedItem.hymnNumber = serverItem.hymnNumber;
      mergedItem.hymnTitle = serverItem.hymnTitle;
      mergedItem.hymnLocale = serverItem.hymnLocale;
    }
    if (acknowledgedPatch.kind === 'INTRODUCTION_ROLE') {
      const roles = { ...(baselineItem.introductionRoles ?? defaultIntroductionRoles(null)) };
      const serverRoles = serverItem.introductionRoles ?? defaultIntroductionRoles(null);
      roles[acknowledgedPatch.role] = serverRoles[acknowledgedPatch.role];
      mergedItem.introductionRoles = roles;
    }
    if (acknowledgedPatch.kind === 'INTRODUCTION_ROLES') mergedItem.introductionRoles = serverItem.introductionRoles;
    return mergedItem;
  });
}

export function ProgramEntriesEditor({ wardId, meetingId, onSaved }: Props) {
  const t = useTranslations('programs');
  const locale = useLocale();
  const tMeeting = useTranslations('meetingForm');
  const publicLabels = getPublicProgramRenderLabels(resolveLocale(locale), 'SACRAMENT');
  const tStand = useTranslations('stand');
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

  function updateVisitingLeader(itemId: string, leaderIndex: number, field: 'name' | 'calling' | 'recognitionType', value: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        const roles = item.introductionRoles ?? defaultIntroductionRoles(null);
        const visitingLeaders = [...(roles.visitingLeaders ?? [])];
        const currentLeader = visitingLeaders[leaderIndex] ?? { name: '', calling: '', recognitionType: 'OTHER' as const };
        visitingLeaders[leaderIndex] = { ...currentLeader, [field]: value } as typeof currentLeader;
        return { ...item, introductionRoles: { ...roles, visitingLeaders } };
      })
    );
  }

  function addVisitingLeader(itemId: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        const roles = item.introductionRoles ?? defaultIntroductionRoles(null);
        return {
          ...item,
          introductionRoles: {
            ...roles,
            visitingLeaders: [...(roles.visitingLeaders ?? []), { name: '', calling: '', recognitionType: 'OTHER' }]
          }
        };
      })
    );
  }

  function removeVisitingLeader(itemId: string, leaderIndex: number) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        const roles = item.introductionRoles ?? defaultIntroductionRoles(null);
        return {
          ...item,
          introductionRoles: { ...roles, visitingLeaders: (roles.visitingLeaders ?? []).filter((_, index) => index !== leaderIndex) }
        };
      })
    );
  }

  function patchesFor(item: EditorProgramItem, original: EditorProgramItem): PatchProgramItemRequest['patch'][] {
    const patches: PatchProgramItemRequest['patch'][] = [];
    for (const field of ['title', 'topic', 'notes', 'programNotes'] as const) {
      if (!sameNullable(item[field], original[field])) patches.push({ kind: 'TEXT', field, value: nullable(item[field] ?? '') });
    }
    if (item.itemType.toUpperCase() === 'INTRODUCTION') {
      const roles = item.introductionRoles ?? defaultIntroductionRoles(null);
      const originalRoles = original.introductionRoles ?? defaultIntroductionRoles(null);
      for (const role of introductionRoles) {
        if (!sameNullable(roles[role.key], originalRoles[role.key])) {
          patches.push({ kind: 'INTRODUCTION_ROLE', role: role.key, value: nullable(roles[role.key]) });
        }
      }
      if (JSON.stringify(roles.visitingLeaders ?? []) !== JSON.stringify(originalRoles.visitingLeaders ?? [])) {
        patches.push({ kind: 'INTRODUCTION_ROLES', value: roles });
      }
    }
    if (
      isHymnItem(item.itemType) &&
      (!sameNullable(item.hymnNumber, original.hymnNumber) ||
        !sameNullable(item.hymnTitle, original.hymnTitle) ||
        item.hymnLocale !== original.hymnLocale)
    ) {
      patches.push({
        kind: 'HYMN',
        number: nullable(item.hymnNumber ?? ''),
        title: nullable(item.hymnTitle ?? ''),
        locale: item.hymnLocale || 'en-US'
      });
    }
    return patches;
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
    const localItems = items;
    const baselineItems = savedItems;
    let nextItems = localItems;
    let nextSavedItems = baselineItems;
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
        nextItems = mergeSavedRowResponse(body.items, localItems, baselineItems, itemId, patch);
        nextSavedItems = mergeSavedBaseline(body.items, nextSavedItems, itemId, patch);
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
          const disabled = item.sourceState === 'MANAGED' || savingId !== null;
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
                        <label key={`${item.id}:${role.key}`} className="space-y-1 text-sm">
                          <span>{t(role.label)}</span>
                          <input
                            className="w-full rounded-md border px-3 py-2"
                            value={roles[role.key]}
                            disabled={disabled}
                            onChange={(event) => updateItem(item.id, { introductionRoles: { ...roles, [role.key]: event.target.value } })}
                          />
                        </label>
                      ))}
                      {item.internalNotesEditable && (
                        <div className="space-y-3 sm:col-span-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="font-medium">{tMeeting('visitingStakeLeaders')}</h4>
                              <p className="text-xs text-muted-foreground">{tMeeting('privateVisitingLeaders')}</p>
                            </div>
                            <button
                              type="button"
                              className="rounded-md border px-3 py-2 text-sm"
                              disabled={disabled}
                              onClick={() => addVisitingLeader(item.id)}
                            >
                              {tMeeting('addLeader')}
                            </button>
                          </div>
                          {(roles.visitingLeaders ?? []).map((leader, leaderIndex) => (
                            <div
                              key={`${item.id}:visiting:${leaderIndex}`}
                              className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                            >
                              <label className="space-y-1 text-sm">
                                <span>{tMeeting('visitingLeaderName', { number: leaderIndex + 1 })}</span>
                                <input
                                  className="w-full rounded-md border px-3 py-2"
                                  value={leader.name}
                                  disabled={disabled}
                                  onChange={(event) => updateVisitingLeader(item.id, leaderIndex, 'name', event.target.value)}
                                />
                              </label>
                              <label className="space-y-1 text-sm">
                                <span>{tMeeting('visitingLeaderCalling', { number: leaderIndex + 1 })}</span>
                                <input
                                  className="w-full rounded-md border px-3 py-2"
                                  value={leader.calling}
                                  disabled={disabled}
                                  onChange={(event) => updateVisitingLeader(item.id, leaderIndex, 'calling', event.target.value)}
                                />
                              </label>
                              <label className="space-y-1 text-sm">
                                <span>{tMeeting('visitingLeaderType', { number: leaderIndex + 1 })}</span>
                                <select
                                  className="w-full rounded-md border px-3 py-2"
                                  value={leader.recognitionType ?? 'OTHER'}
                                  disabled={disabled}
                                  onChange={(event) => updateVisitingLeader(item.id, leaderIndex, 'recognitionType', event.target.value)}
                                >
                                  {visitingLeaderTypes.map((type) => (
                                    <option key={type.value} value={type.value}>
                                      {tStand(type.label)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                className="self-end rounded-md border px-3 py-2 text-sm"
                                disabled={disabled}
                                onClick={() => removeVisitingLeader(item.id, leaderIndex)}
                              >
                                {tMeeting('removeVisitingLeader', { number: leaderIndex + 1 })}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>{t('entryTitle')}</span>
                      <input
                        className="w-full rounded-md border px-3 py-2"
                        value={item.title ?? ''}
                        disabled={disabled}
                        onChange={(event) => updateItem(item.id, { title: event.target.value })}
                      />
                    </label>
                    {item.itemType.toUpperCase() === 'SPEAKER' ? (
                      <label className="space-y-1 text-sm">
                        <span>{t('speakerTopic')}</span>
                        <input
                          className="w-full rounded-md border px-3 py-2"
                          value={item.topic ?? ''}
                          disabled={disabled}
                          onChange={(event) => updateItem(item.id, { topic: event.target.value })}
                        />
                      </label>
                    ) : null}
                  </div>
                  {isHymnItem(item.itemType) ? (
                    <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                      <label className="space-y-1 text-sm">
                        <span>{t('hymnNumber')}</span>
                        <input
                          className="w-full rounded-md border px-3 py-2"
                          value={item.hymnNumber ?? ''}
                          disabled={disabled}
                          onChange={(event) => updateItem(item.id, { hymnNumber: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span>{t('hymnTitle')}</span>
                        <input
                          className="w-full rounded-md border px-3 py-2"
                          value={item.hymnTitle ?? ''}
                          disabled={disabled}
                          onChange={(event) => updateItem(item.id, { hymnTitle: event.target.value })}
                        />
                      </label>
                    </div>
                  ) : null}
                  {item.internalNotesEditable ? (
                    <label className="block space-y-1 text-sm">
                      <span>{t('internalNotes')}</span>
                      <textarea
                        className="min-h-20 w-full rounded-md border px-3 py-2"
                        value={item.notes ?? ''}
                        disabled={disabled}
                        onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">{t('internalNotesDescription')}</span>
                    </label>
                  ) : null}
                  <label className="block space-y-1 text-sm">
                    <span>{t('programNotes')}</span>
                    <textarea
                      className="min-h-20 w-full rounded-md border px-3 py-2"
                      value={item.programNotes ?? ''}
                      disabled={disabled}
                      onChange={(event) => updateItem(item.id, { programNotes: event.target.value })}
                    />
                    <span className="text-xs text-amber-900">{t('programNotesDisclaimer')}</span>
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={disabled}
                      onClick={() => void saveItem(item.id)}
                    >
                      {state === 'error' ? t('retryProgramEntry') : t('saveProgramEntry')}
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
