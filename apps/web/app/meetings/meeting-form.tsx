'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { HymnAutocomplete } from '@/components/HymnAutocomplete';
import { InternalNotesPanel, type InternalNoteRow } from '@/components/InternalNotesPanel';
import { WardBusinessSection, type BusinessLine } from '@/components/WardBusinessSection';
import { MemberAutocomplete } from '@/components/ui/member-autocomplete';
import { toYyyyMmDd } from '@/src/meetings/date';
import {
  getProgramItemLabel,
  INTRODUCTION_ITEM_TYPE,
  MEETING_TYPES,
  type IntroductionRoles,
  type ProgramItemInput
} from '@/src/meetings/types';
import { getDefaultProgramItemsForMeetingType } from '@/src/meetings/default-program';

import { DeleteMeetingButton } from './delete-meeting-button';
import { cn } from '@/lib/utils';

const PERSON_ITEM_TYPES = new Set(['INVOCATION', 'SPEAKER', 'BENEDICTION']);
const HYMN_ITEM_TYPES = new Set(['OPENING_HYMN', 'REST_HYMN', 'CLOSING_HYMN', 'SPECIAL_HYMN', 'SACRAMENT_HYMN']);
const PLACEHOLDER_ITEM_TYPES = new Set(['SACRAMENT', 'TESTIMONIES']);
const ANNOUNCEMENT_ITEM_TYPE = 'ANNOUNCEMENT';
const BUSINESS_ITEM_TYPE = 'WARD_AND_STAKE_BUSINESS';
const HYMN_POSITION_TO_ITEM_TYPE: Record<string, string> = {
  OPENING: 'OPENING_HYMN',
  SACRAMENT: 'SACRAMENT_HYMN',
  CLOSING: 'CLOSING_HYMN',
  REST: 'REST_HYMN',
  SPECIAL: 'SPECIAL_HYMN'
};
const ITEM_TYPE_TO_HYMN_POSITION: Record<string, string> = {
  OPENING_HYMN: 'OPENING',
  SACRAMENT_HYMN: 'SACRAMENT',
  CLOSING_HYMN: 'CLOSING',
  REST_HYMN: 'REST',
  SPECIAL_HYMN: 'SPECIAL'
};
function getItemTitleLabel(itemType: string) {
  if (HYMN_ITEM_TYPES.has(itemType) || itemType === BUSINESS_ITEM_TYPE) {
    return 'Title';
  }

  return 'Name';
}

function getProgramItemAccentClass(itemType: string) {
  if (HYMN_ITEM_TYPES.has(itemType)) return 'program-item--hymn';
  if (itemType === 'INVOCATION' || itemType === 'BENEDICTION') return 'program-item--prayer';
  if (itemType === 'SPEAKER' || itemType === INTRODUCTION_ITEM_TYPE) return 'program-item--speaker';
  if (itemType === 'SACRAMENT') return 'program-item--sacrament';
  if (itemType === BUSINESS_ITEM_TYPE) return 'program-item--business';
  if (itemType === ANNOUNCEMENT_ITEM_TYPE) return 'program-item--announcement';
  if (itemType === 'TESTIMONIES') return 'program-item--testimony';
  return 'program-item--closing';
}

type MeetingFormProps = {
  wardId: string;
  mode: 'create' | 'edit';
  meetingId?: string;
  initialMeetingDate?: string;
  initialMeetingType?: string;
  initialProgramItems?: ProgramItemInput[];
  publishedVersionCount?: number;
  internalNotes?: InternalNoteRow[];
  canUseInternalNotes?: boolean;
  businessLines?: BusinessLine[];
  canManageBusiness?: boolean;
  standAnnouncements?: Array<{ title: string; body: string | null }>;
};

const PROGRAM_ITEM_TYPES = [
  'ANNOUNCEMENT',
  'OPENING_HYMN',
  'INVOCATION',
  'WARD_AND_STAKE_BUSINESS',
  'SACRAMENT_HYMN',
  'SACRAMENT',
  'SPEAKER',
  'REST_HYMN',
  'TESTIMONIES',
  'CLOSING_HYMN',
  'BENEDICTION'
];

const DEFAULT_PROGRAM_ITEM: Omit<ProgramItemInput, 'itemType'> = {
  title: '',
  notes: '',
  topic: '',
  programNotes: '',
  hymnNumber: '',
  hymnTitle: ''
};

export function MeetingForm({
  wardId,
  mode,
  meetingId,
  initialMeetingDate = '',
  initialMeetingType = 'SACRAMENT',
  initialProgramItems = [],
  publishedVersionCount = 0,
  internalNotes = [],
  canUseInternalNotes = false,
  businessLines = [],
  canManageBusiness = false,
  standAnnouncements = []
}: MeetingFormProps) {
  const router = useRouter();
  const [meetingDate, setMeetingDate] = useState(toYyyyMmDd(initialMeetingDate));
  const [meetingType, setMeetingType] = useState(initialMeetingType);
  const [programItems, setProgramItems] = useState<ProgramItemInput[]>(
    initialProgramItems.length ? initialProgramItems : getDefaultProgramItemsForMeetingType(initialMeetingType)
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedCount, setPublishedCount] = useState(publishedVersionCount);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [newItemType, setNewItemType] = useState('SPEAKER');
  const autosaveSnapshot = useRef(
    JSON.stringify({
      meetingDate: toYyyyMmDd(initialMeetingDate),
      meetingType: initialMeetingType,
      programItems: initialProgramItems.length ? initialProgramItems : getDefaultProgramItemsForMeetingType(initialMeetingType)
    })
  );
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSave = useMemo(() => Boolean(meetingDate && meetingType), [meetingDate, meetingType]);

  useEffect(() => {
    if (mode !== 'edit' || !meetingId) return;
    if (!canSave) return;
    const snapshot = JSON.stringify({ meetingDate, meetingType, programItems });
    if (autosaveSnapshot.current === snapshot) return;
    autosaveSnapshot.current = snapshot;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void (async () => {
        setAutosaveStatus('saving');
        setError(null);
        try {
          const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ meetingDate, meetingType, programItems })
          });
          if (!response.ok) {
            setAutosaveStatus('error');
            setError('Unable to save meeting changes.');
            return;
          }
          setAutosaveStatus('saved');
        } catch {
          setAutosaveStatus('error');
          setError('Unable to save meeting changes.');
        }
      })();
    }, 600);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [canSave, meetingDate, meetingId, meetingType, mode, programItems, wardId]);

  function updateProgramItem(index: number, field: keyof ProgramItemInput, value: string) {
    setProgramItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function updateIntroductionRole(index: number, role: keyof IntroductionRoles, value: string) {
    setProgramItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              introductionRoles: { presiding: '', conducting: '', organist: '', chorister: '', ...item.introductionRoles, [role]: value }
            }
          : item
      )
    );
  }

  function updateHymn(index: number, hymnNumber: string, hymnTitle: string) {
    setProgramItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, hymnNumber, hymnTitle } : item)));
  }
  function updateHymnPosition(index: number, position: string) {
    const mappedType = HYMN_POSITION_TO_ITEM_TYPE[position] ?? 'OPENING_HYMN';
    setProgramItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, itemType: mappedType } : item)));
  }

  function moveItemToIndex(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= programItems.length || fromIndex === toIndex) return;

    setProgramItems((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function onMeetingTypeChange(nextMeetingType: string) {
    setMeetingType(nextMeetingType);

    if (mode === 'create') {
      setProgramItems(getDefaultProgramItemsForMeetingType(nextMeetingType));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'edit') return;
    if (!canSave) {
      setError('Meeting date and meeting type are required.');
      return;
    }

    setSaving(true);
    setError(null);

    const url = mode === 'create' ? `/api/w/${wardId}/meetings` : `/api/w/${wardId}/meetings/${meetingId}`;
    const method = mode === 'create' ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        meetingDate,
        meetingType,
        programItems
      })
    });

    if (!response.ok) {
      setSaving(false);
      setError('Unable to save meeting.');
      return;
    }

    if (mode === 'create') {
      const payload = (await response.json()) as { id: string };
      router.push(`/meetings/${payload.id}/edit`);
      router.refresh();
      return;
    }

    setSaving(false);
    router.push('/meetings');
    router.refresh();
  }

  async function onPublish() {
    if (!meetingId) {
      return;
    }

    setPublishing(true);
    setError(null);

    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/publish`, {
      method: 'POST'
    });

    if (!response.ok) {
      setPublishing(false);
      try {
        const errBody = (await response.json()) as { error?: string; detail?: string };
        setError(errBody.detail ?? errBody.error ?? 'Unable to publish meeting.');
      } catch {
        setError('Unable to publish meeting.');
      }
      return;
    }

    const payload = (await response.json()) as { version: number };
    setPublishedCount(payload.version);
    setPublishing(false);
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        {mode === 'create' ? (
          <label className="space-y-2 text-sm">
            <span className="font-medium">Meeting date</span>
            <input
              type="date"
              className="w-full rounded-md border px-3 py-2"
              value={meetingDate}
              onChange={(event) => setMeetingDate(event.target.value)}
              required
            />
          </label>
        ) : (
          <div className="space-y-1 text-sm">
            <span className="font-medium">Meeting date</span>
            <p className="rounded-md border bg-muted px-3 py-2" aria-label="Meeting date, cannot be changed">
              {meetingDate}
            </p>
            <p className="text-xs text-muted-foreground">Date cannot be changed after creation.</p>
          </div>
        )}

        {mode === 'create' ? (
          <label className="space-y-2 text-sm">
            <span className="font-medium">Meeting type</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={meetingType}
              onChange={(event) => onMeetingTypeChange(event.target.value)}
              required
            >
              {MEETING_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-1 text-sm">
            <span className="font-medium">Meeting type</span>
            <p className="rounded-md border bg-muted px-3 py-2" aria-label="Meeting type, cannot be changed">
              {meetingType.replaceAll('_', ' ')}
            </p>
            <p className="text-xs text-muted-foreground">Type cannot be changed after creation.</p>
          </div>
        )}
      </section>

      <section key={mode === 'create' ? meetingType : 'edit'} className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Program items</h2>
          <div className="flex items-center gap-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium"></span>
              <select className="rounded-md border px-3 py-2" value={newItemType} onChange={(event) => setNewItemType(event.target.value)}>
                {PROGRAM_ITEM_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {getProgramItemLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProgramItems((current) => [...current, { itemType: newItemType, ...DEFAULT_PROGRAM_ITEM }])}
            >
              Add item
            </Button>
          </div>
        </div>

        {programItems.map((item, index) => (
          <article
            className={cn('program-item space-y-3 rounded-md border p-3', getProgramItemAccentClass(item.itemType))}
            draggable={item.itemType !== INTRODUCTION_ITEM_TYPE}
            onDragStart={
              item.itemType === INTRODUCTION_ITEM_TYPE
                ? undefined
                : (event) => {
                    event.dataTransfer.setData('text/program-item-index', String(index));
                    event.dataTransfer.effectAllowed = 'move';
                  }
            }
            onDragOver={item.itemType === INTRODUCTION_ITEM_TYPE ? undefined : (event) => event.preventDefault()}
            onDrop={
              item.itemType === INTRODUCTION_ITEM_TYPE
                ? undefined
                : (event) => {
                    event.preventDefault();
                    const rawIndex = event.dataTransfer.getData('text/program-item-index');
                    const fromIndex = Number(rawIndex);
                    if (!Number.isNaN(fromIndex)) moveItemToIndex(fromIndex, index);
                  }
            }
          >
            <div className="program-item-header flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn('text-muted-foreground', item.itemType === INTRODUCTION_ITEM_TYPE ? 'opacity-0' : 'cursor-grab')}
                  aria-hidden="true"
                  title={item.itemType === INTRODUCTION_ITEM_TYPE ? undefined : 'Drag to reorder'}
                >
                  ⋮⋮
                </span>
                <h3 className="truncate text-sm font-semibold">{getProgramItemLabel(item.itemType)}</h3>
              </div>
              {item.itemType !== INTRODUCTION_ITEM_TYPE ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    if (window.confirm('Delete this program section?')) {
                      setProgramItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
                    }
                  }}
                  aria-label="Delete program section"
                >
                  ×
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Required</span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {item.itemType === INTRODUCTION_ITEM_TYPE ? (
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                  {(
                    [
                      ['presiding', 'Presiding'],
                      ['conducting', 'Conducting'],
                      ['organist', 'Organist / Pianist'],
                      ['chorister', 'Chorister']
                    ] as const
                  ).map(([role, label]) => (
                    <label key={role} className="space-y-1 text-sm">
                      <span className="font-medium">{label}</span>
                      <MemberAutocomplete
                        wardId={wardId}
                        value={item.introductionRoles?.[role] ?? ''}
                        onChange={(value) => updateIntroductionRole(index, role, value)}
                        className="w-full rounded-md border px-3 py-2"
                        placeholder="Name"
                        leadershipOnly={role === 'presiding' || role === 'conducting'}
                      />
                    </label>
                  ))}
                </div>
              ) : !HYMN_ITEM_TYPES.has(item.itemType) && item.itemType !== BUSINESS_ITEM_TYPE ? (
                <label className="space-y-1 text-sm">
                  <span className="font-medium">{getItemTitleLabel(item.itemType)}</span>
                  {PERSON_ITEM_TYPES.has(item.itemType) ? (
                    <MemberAutocomplete
                      wardId={wardId}
                      value={item.title}
                      onChange={(value) => updateProgramItem(index, 'title', value)}
                      className="w-full rounded-md border px-3 py-2"
                      placeholder="Name"
                      minAge={item.itemType === 'SPEAKER' ? 11 : undefined}
                      leadershipOnly={false}
                    />
                  ) : item.itemType === ANNOUNCEMENT_ITEM_TYPE ? (
                    <div className="rounded-md border bg-muted p-3 text-sm">
                      <p className="mb-2 text-muted-foreground">
                        Announcements marked “Include in At the Stand” appear here automatically.
                      </p>
                      {standAnnouncements.length ? (
                        <ul className="space-y-2">
                          {standAnnouncements.map((announcement) => (
                            <li key={`${announcement.title}-${announcement.body ?? ''}`} className="rounded border bg-background p-2">
                              <p className="font-medium">{announcement.title}</p>
                              {announcement.body ? (
                                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{announcement.body}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground">No active announcements marked for At the Stand.</p>
                      )}
                    </div>
                  ) : PLACEHOLDER_ITEM_TYPES.has(item.itemType) ? (
                    <input
                      className="w-full rounded-md border px-3 py-2 bg-muted"
                      value={item.itemType === 'SACRAMENT' ? 'Sacrament (placeholder)' : 'Testimonies (placeholder)'}
                      readOnly
                    />
                  ) : (
                    <input
                      className="w-full rounded-md border px-3 py-2"
                      value={item.title}
                      onChange={(event) => updateProgramItem(index, 'title', event.target.value)}
                    />
                  )}
                </label>
              ) : null}

              {HYMN_ITEM_TYPES.has(item.itemType) ? (
                <div className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium">Hymn</span>
                  <div className="space-y-2">
                    {ITEM_TYPE_TO_HYMN_POSITION[item.itemType] ? (
                      <select
                        className="w-full rounded-md border px-3 py-2"
                        value={ITEM_TYPE_TO_HYMN_POSITION[item.itemType]}
                        onChange={(event) => updateHymnPosition(index, event.target.value)}
                      >
                        <option value="OPENING">Opening</option>
                        <option value="SACRAMENT">Sacrament</option>
                        <option value="CLOSING">Closing</option>
                        <option value="REST">Rest</option>
                        <option value="SPECIAL">Special</option>
                      </select>
                    ) : null}
                    <HymnAutocomplete
                      hymnNumber={item.hymnNumber}
                      hymnTitle={item.hymnTitle}
                      onChange={(num, title) => updateHymn(index, num, title)}
                    />
                  </div>
                </div>
              ) : null}

              {item.itemType === 'SPEAKER' ? (
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Speaking topic</span>
                  <input
                    className="w-full rounded-md border px-3 py-2"
                    value={item.topic ?? ''}
                    onChange={(event) => updateProgramItem(index, 'topic', event.target.value)}
                    placeholder="Optional topic"
                  />
                </label>
              ) : null}
            </div>

            {canUseInternalNotes && item.id ? (
              <InternalNotesPanel
                wardId={wardId}
                target={{ type: 'PROGRAM_ITEM', programItemId: item.id }}
                notes={internalNotes.filter((note) => note.program_item_id === item.id)}
                title="Internal notes"
              />
            ) : null}
            {item.itemType === BUSINESS_ITEM_TYPE ? (
              <div className="grid gap-3">
                <WardBusinessSection
                  wardId={wardId}
                  meetingId={meetingId ?? ''}
                  lines={businessLines}
                  canManage={canManageBusiness}
                  showAnnounce={false}
                  showScript={false}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.notes.includes('[STAKE_BUSINESS]')}
                    onChange={(event) =>
                      updateProgramItem(
                        index,
                        'notes',
                        event.target.checked
                          ? `${item.notes}\n[STAKE_BUSINESS]`.trim()
                          : item.notes.replace('\n[STAKE_BUSINESS]', '').replace('[STAKE_BUSINESS]', '').trim()
                      )
                    }
                  />
                  Includes stake business
                </label>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {mode === 'create' ? (
          <Button type="submit" disabled={saving || !canSave}>
            Create meeting
          </Button>
        ) : (
          <span className="self-center text-sm text-muted-foreground" role="status" aria-live="polite">
            {autosaveStatus === 'saving'
              ? 'Saving changes...'
              : autosaveStatus === 'saved'
                ? 'Changes saved'
                : autosaveStatus === 'error'
                  ? 'Changes not saved'
                  : 'Changes save automatically'}
          </span>
        )}
        {mode === 'edit' ? (
          <Button type="button" variant="outline" onClick={onPublish} disabled={publishing || !meetingId}>
            {publishing ? 'Publishing...' : publishedCount ? 'Republish' : 'Publish'}
          </Button>
        ) : null}
        {mode === 'edit' && meetingId ? <DeleteMeetingButton wardId={wardId} meetingId={meetingId} /> : null}
      </div>
    </form>
  );
}
