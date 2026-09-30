'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type Program = { eventId: string; revision: number | null; source: { date: string; title: string; location?: string | null; participantDisplayName: string; programItems: Array<{ key: string; label: string; content?: string | null; sequence: number }> } };

type Props = { wardId: string; canEdit: boolean };
const empty = { date: '', title: '', location: '', participantDisplayName: '', programItems: [] as Program['source']['programItems'] };

export function BaptismProgramsClient({ wardId, canEdit }: Props) {
  const t = useTranslations('programs');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('');

  async function load() {
    const response = await fetch(`/api/w/${wardId}/baptism-programs`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? t('baptismFailedLoad'));
    setPrograms(body.programs ?? []);
  }
  useEffect(() => { void load().catch((error: unknown) => setStatus(error instanceof Error ? error.message : t('baptismFailedLoad'))); }, [wardId]);

  function edit(program: Program) {
    setEditing(program.eventId);
    setRevision(program.revision ?? 1);
    setForm({ ...program.source, location: program.source.location ?? '', programItems: program.source.programItems ?? [] });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus(t('saving'));
    const response = await fetch(editing ? `/api/w/${wardId}/baptism-programs/${editing}` : `/api/w/${wardId}/baptism-programs`, { method: editing ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editing ? { expectedRevision: revision, source: form } : form) });
    const body = await response.json();
    if (!response.ok) { setStatus(body.error ?? t('saveFailed')); return; }
    setStatus(t('saved'));
    setForm(empty);
    setEditing(null);
    await load();
  }
  return <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
    <header><p className="text-sm text-muted-foreground">{t('designer')}</p><h1 className="text-3xl font-semibold">{t('baptismPrograms')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('baptismProgramsDescription')}</p></header>
    <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-2">
      <label className="grid gap-1 text-sm">{t('baptismDate')}<input disabled={!canEdit} required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="rounded-md border bg-background px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">{t('baptismTitle')}<input disabled={!canEdit} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-md border bg-background px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">{t('baptismLocation')}<input disabled={!canEdit} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="rounded-md border bg-background px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">{t('baptismParticipantName')}<input disabled={!canEdit} required value={form.participantDisplayName} onChange={(event) => setForm({ ...form, participantDisplayName: event.target.value })} className="rounded-md border bg-background px-3 py-2" /></label>
      <div className="flex items-center gap-2 md:col-span-2">{canEdit ? <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{editing ? t('baptismSaveChanges') : t('baptismCreate')}</button> : null}{editing && canEdit ? <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="rounded-md border px-4 py-2 text-sm">{t('baptismCancel')}</button> : null}<span role="status" className="text-sm text-muted-foreground">{status}</span></div>
    </form>
    <section aria-label={t('baptismPrograms')} className="grid gap-4 md:grid-cols-2">{programs.map((program) => <article key={program.eventId} className="rounded-lg border bg-card p-5"><h2 className="font-semibold">{program.source.title}</h2><p className="text-sm text-muted-foreground">{program.source.date} · {program.source.participantDisplayName}</p><p className="mt-1 text-sm text-muted-foreground">{program.source.location}</p>{canEdit ? <button type="button" onClick={() => edit(program)} className="mt-4 rounded-md border px-3 py-2 text-sm">{t('baptismEdit')}</button> : null}</article>)}</section>
  </main>;
}
