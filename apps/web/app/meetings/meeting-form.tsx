'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { HymnAutocomplete } from '@/components/HymnAutocomplete';
import { MemberAutocomplete } from '@/components/ui/member-autocomplete';
import { toYyyyMmDd } from '@/src/meetings/date';
import { MEETING_TYPES, type ProgramItemInput } from '@/src/meetings/types';
import { getDefaultProgramItemsForMeetingType } from '@/src/meetings/default-program';

const PERSON_ITEM_TYPES = new Set(['PRESIDING', 'CONDUCTING', 'INVOCATION', 'SPEAKER', 'BENEDICTION']);
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

type MeetingFormProps = {
  wardId: string;
  mode: 'create' | 'edit';
  meetingId?: string;
  initialMeetingDate?: string;
  initialMeetingType?: string;
  initialProgramItems?: ProgramItemInput[];
  publishedVersionCount?: number;
};

function normalizeDateInput(value: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const PROGRAM_ITEM_TYPES = [
  'PRESIDING',
  'CONDUCTING',
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
  publishedVersionCount = 0
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
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string }>>([]);
  const [newItemType, setNewItemType] = useState('SPEAKER');
  const [activeNotesEditor, setActiveNotesEditor] = useState<Record<string, boolean>>({});

  const canSave = useMemo(() => Boolean(meetingDate && meetingType), [meetingDate, meetingType]);
  useEffect(() => {
    let mounted = true;
    fetch(`/api/w/${wardId}/announcements`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!mounted || !payload?.announcements) return;
        setAnnouncements(payload.announcements.map((item: { id: string; title: string }) => ({ id: item.id, title: item.title })));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [wardId]);

  function updateProgramItem(index: number, field: keyof ProgramItemInput, value: string) {
    setProgramItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function updateHymn(index: number, hymnNumber: string, hymnTitle: string) {
    setProgramItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, hymnNumber, hymnTitle } : item))
    );
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

  function itemKey(item: ProgramItemInput, index: number) {
    return `${item.id ?? 'new'}-${index}`;
  }

  function onMeetingTypeChange(nextMeetingType: string) {
    setMeetingType(nextMeetingType);

    if (mode === 'create') {
      setProgramItems(getDefaultProgramItemsForMeetingType(nextMeetingType));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setError('Unable to publish meeting.');
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

        <label className="space-y-2 text-sm">
          <span className="font-medium">Meeting type</span>
          <select className="w-full rounded-md border px-3 py-2" value={meetingType} onChange={(event) => onMeetingTypeChange(event.target.value)} required>
            {MEETING_TYPES.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Program items</h2>
          <div className="flex items-center gap-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium"></span>
              <select className="rounded-md border px-3 py-2" value={newItemType} onChange={(event) => setNewItemType(event.target.value)}>
                {PROGRAM_ITEM_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="outline" onClick={() => setProgramItems((current) => [...current, { itemType: newItemType, ...DEFAULT_PROGRAM_ITEM }])}>
              Add item
            </Button>
          </div>
        </div>

        {programItems.map((item, index) => (
          <article
            key={`${item.id ?? 'new'}-${index}`}
            className="space-y-3 rounded-md border p-3"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text/program-item-index', String(index));
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const rawIndex = event.dataTransfer.getData('text/program-item-index');
              const fromIndex = Number(rawIndex);
              if (!Number.isNaN(fromIndex)) moveItemToIndex(fromIndex, index);
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{item.itemType.replaceAll('_', ' ')}</h3>
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {!HYMN_ITEM_TYPES.has(item.itemType) && item.itemType !== BUSINESS_ITEM_TYPE ? (
                <label className="space-y-1 text-sm">
                  <span className="font-medium">{getItemTitleLabel(item.itemType)}</span>
                  {PERSON_ITEM_TYPES.has(item.itemType) ? (
                    <MemberAutocomplete
                      wardId={wardId}
                      value={item.title}
                      onChange={(value) => updateProgramItem(index, 'title', value)}
                      className="w-full rounded-md border px-3 py-2"
                      placeholder="Name"
                    />
                  ) : item.itemType === ANNOUNCEMENT_ITEM_TYPE ? (
                    <select className="w-full rounded-md border px-3 py-2" value={item.title} onChange={(event) => updateProgramItem(index, 'title', event.target.value)}>
                      <option value="">Select an announcement</option>
                      {announcements.map((announcement) => (
                        <option key={announcement.id} value={announcement.title}>
                          {announcement.title}
                        </option>
                      ))}
                    </select>
                  ) : PLACEHOLDER_ITEM_TYPES.has(item.itemType) ? (
                    <input className="w-full rounded-md border px-3 py-2 bg-muted" value={item.itemType === 'SACRAMENT' ? 'Sacrament (placeholder)' : 'Testimonies (placeholder)'} readOnly />
                  ) : (
                    <input className="w-full rounded-md border px-3 py-2" value={item.title} onChange={(event) => updateProgramItem(index, 'title', event.target.value)} />
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
                    <HymnAutocomplete hymnNumber={item.hymnNumber} hymnTitle={item.hymnTitle} onChange={(num, title) => updateHymn(index, num, title)} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Notes</span>
                {!activeNotesEditor[itemKey(item, index)] ? (
                  <button
                    type="button"
                    className="text-xs text-blue-700 underline underline-offset-2"
                    onClick={() => setActiveNotesEditor((current) => ({ ...current, [itemKey(item, index)]: true }))}
                  >
                    {item.notes.trim() ? 'Edit note' : 'Add note'}
                  </button>
                ) : null}
              </div>
              {activeNotesEditor[itemKey(item, index)] ? (
                <textarea
                  className="min-h-20 w-full rounded-md border px-3 py-2"
                  value={item.notes}
                  onChange={(event) => updateProgramItem(index, 'notes', event.target.value)}
                  onBlur={() => setActiveNotesEditor((current) => ({ ...current, [itemKey(item, index)]: false }))}
                  autoFocus
                />
              ) : item.notes.trim() ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">{item.notes}</p>
              ) : (
                <p className="text-xs text-muted-foreground">No notes</p>
              )}
            </div>
            {item.itemType === BUSINESS_ITEM_TYPE ? (
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.notes.includes('[STAKE_BUSINESS]')}
                    onChange={(event) =>
                      updateProgramItem(index, 'notes', event.target.checked ? `${item.notes}\n[STAKE_BUSINESS]`.trim() : item.notes.replace('\n[STAKE_BUSINESS]', '').replace('[STAKE_BUSINESS]', '').trim())
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
        <Button type="submit" disabled={saving || !canSave}>
          {saving ? 'Saving...' : mode === 'create' ? 'Create meeting' : 'Save changes'}
        </Button>
        {mode === 'edit' ? (
          <Button type="button" variant="outline" onClick={onPublish} disabled={publishing || !meetingId}>
            {publishing ? 'Publishing...' : publishedCount ? 'Republish' : 'Publish'}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
