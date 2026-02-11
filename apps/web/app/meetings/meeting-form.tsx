'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { MEETING_TYPES, type ProgramItemInput } from '@/src/meetings/types';

type MeetingFormProps = {
  wardId: string;
  mode: 'create' | 'edit';
  meetingId?: string;
  initialMeetingDate?: string;
  initialMeetingType?: string;
  initialProgramItems?: ProgramItemInput[];
};

const PROGRAM_ITEM_TYPES = ['PRESIDING', 'CONDUCTING', 'OPENING_HYMN', 'INVOCATION', 'SACRAMENT_HYMN', 'SACRAMENT', 'SPEAKER', 'CLOSING_HYMN', 'BENEDICTION', 'ANNOUNCEMENT'];

export function MeetingForm({
  wardId,
  mode,
  meetingId,
  initialMeetingDate = '',
  initialMeetingType = 'SACRAMENT',
  initialProgramItems = []
}: MeetingFormProps) {
  const router = useRouter();
  const [meetingDate, setMeetingDate] = useState(initialMeetingDate);
  const [meetingType, setMeetingType] = useState(initialMeetingType);
  const [programItems, setProgramItems] = useState<ProgramItemInput[]>(
    initialProgramItems.length ? initialProgramItems : [{ itemType: 'OPENING_HYMN', title: '', notes: '', hymnNumber: '', hymnTitle: '' }]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => Boolean(meetingDate && meetingType), [meetingDate, meetingType]);

  function updateProgramItem(index: number, field: keyof ProgramItemInput, value: string) {
    setProgramItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= programItems.length) {
      return;
    }

    setProgramItems((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
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
          <select className="w-full rounded-md border px-3 py-2" value={meetingType} onChange={(event) => setMeetingType(event.target.value)} required>
            {MEETING_TYPES.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Program items</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setProgramItems((current) => [...current, { itemType: 'SPEAKER', title: '', notes: '', hymnNumber: '', hymnTitle: '' }])
            }
          >
            Add item
          </Button>
        </div>

        {programItems.map((item, index) => (
          <article key={`${item.id ?? 'new'}-${index}`} className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Type</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={item.itemType}
                  onChange={(event) => updateProgramItem(index, 'itemType', event.target.value)}
                >
                  {PROGRAM_ITEM_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Title</span>
                <input className="w-full rounded-md border px-3 py-2" value={item.title} onChange={(event) => updateProgramItem(index, 'title', event.target.value)} />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Hymn number</span>
                <input className="w-full rounded-md border px-3 py-2" value={item.hymnNumber} onChange={(event) => updateProgramItem(index, 'hymnNumber', event.target.value)} />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Hymn title</span>
                <input className="w-full rounded-md border px-3 py-2" value={item.hymnTitle} onChange={(event) => updateProgramItem(index, 'hymnTitle', event.target.value)} />
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Notes</span>
              <textarea className="min-h-20 w-full rounded-md border px-3 py-2" value={item.notes} onChange={(event) => updateProgramItem(index, 'notes', event.target.value)} />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                Move up
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => moveItem(index, 1)} disabled={index === programItems.length - 1}>
                Move down
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => setProgramItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                Remove
              </Button>
            </div>
          </article>
        ))}
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button type="submit" disabled={saving || !canSave}>
        {saving ? 'Saving...' : mode === 'create' ? 'Create meeting' : 'Save changes'}
      </Button>
    </form>
  );
}
