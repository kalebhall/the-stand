'use client';

import { useEffect, useMemo, useState } from 'react';

type Scope = 'SYSTEM' | 'STAKE';
type Template = { id: string; name: string; description?: string | null; status: string; scopeType: Scope; distributionPolicy?: string | null; version?: { version?: number; lock?: unknown } | null };
type Version = { id: string; version: number; schema_version?: number; created_at?: string; lock_json?: unknown };

function readLockMode(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'mode' in value && typeof value.mode === 'string') return value.mode;
  return 'UNLOCKED';
}

const emptyLayout = { schemaVersion: 1, documentType: 'SACRAMENT_PROGRAM', paper: 'LETTER', orientation: 'PORTRAIT', fold: 'BIFOLD', theme: { fontFamily: 'SYSTEM_SANS', baseFontSize: 12, accentColor: '#1f2937' }, pages: [{ id: 'page-1', regions: [{ id: 'region-1', ratio: 1, gutter: 0, blocks: [{ id: 'block-1', type: 'DOCUMENT_TITLE', width: 'FULL', dataMode: 'AUTO', visibility: 'VISIBLE', printBehavior: 'PRINT_AND_DIGITAL', digitalBehavior: 'NORMAL', config: { text: 'Sacrament Meeting' } }] }] }] };

export function TemplateAdminClient({ activeStakeId, canSystem, canStake }: { activeStakeId: string | null; canSystem: boolean; canStake: boolean }) {
  const [scope, setScope] = useState<Scope>(canSystem ? 'SYSTEM' : 'STAKE');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [lockMode, setLockMode] = useState('UNLOCKED');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [policy, setPolicy] = useState('DUPLICATE_AND_CUSTOMIZE');
  const [message, setMessage] = useState('Loading templates…');
  const base = scope === 'SYSTEM' ? '/api/support/document-templates' : `/api/stakes/${encodeURIComponent(activeStakeId ?? '')}/document-templates`;

  async function request(path = '', init?: RequestInit) {
    const response = await fetch(`${base}${path}`, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? 'Request failed');
    return body;
  }
  async function load() {
    try { const body = await request(); const nextTemplates = body.templates ?? []; setTemplates(nextTemplates); setSelected(nextTemplates[0] ?? null); setMessage(''); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Failed to load templates'); }
  }
  useEffect(() => { void load(); }, [scope, activeStakeId]);
  useEffect(() => {
    if (!selected) { setVersions([]); setLockMode('UNLOCKED'); return; }
    setName(selected.name); setDescription(selected.description ?? ''); setPolicy(selected.distributionPolicy ?? 'DUPLICATE_AND_CUSTOMIZE');
    void request(`/${encodeURIComponent(selected.id)}/versions`).then((body) => { const nextVersions = body.versions ?? []; setVersions(nextVersions); setLockMode(readLockMode(nextVersions[0]?.lock_json)); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to load history'));
  }, [selected]);

  const canUseScope = useMemo(() => scope === 'SYSTEM' ? canSystem : canStake, [scope, canStake, canSystem]);
  async function createDraft() {
    try { const body = await request('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'New template', description: '', distributionPolicy: 'DUPLICATE_AND_CUSTOMIZE', layout: emptyLayout }) }); setMessage('Draft created.'); await load(); setSelected(body.template); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Failed to create draft'); }
  }
  async function saveMetadata() {
    if (!selected) return;
    try { await request(`/${encodeURIComponent(selected.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, description, distributionPolicy: policy }) }); setMessage('Draft metadata saved.'); await load(); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Failed to save metadata'); }
  }
  async function action(action: 'publish' | 'archive') {
    if (!selected) return;
    try { await request(`/${encodeURIComponent(selected.id)}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: action === 'publish' ? JSON.stringify({}) : undefined }); setMessage(`Template ${action}ed.`); await load(); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : `Failed to ${action} template`); }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template scope">
      {canSystem ? <button type="button" role="tab" aria-selected={scope === 'SYSTEM'} onClick={() => setScope('SYSTEM')} className="rounded-md border px-3 py-2 text-sm">System sources</button> : null}
      {canStake ? <button type="button" role="tab" aria-selected={scope === 'STAKE'} onClick={() => setScope('STAKE')} className="rounded-md border px-3 py-2 text-sm">Stake sources</button> : null}
      {canUseScope ? <button type="button" onClick={() => void createDraft()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">New draft</button> : null}
    </div>
    <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{message}</p>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section aria-label="Template sources" className="space-y-2 rounded-lg border p-4"><h2 className="font-semibold">{scope === 'SYSTEM' ? 'System' : 'Stake'} templates</h2>{templates.length ? templates.map((template) => <button type="button" key={template.id} onClick={() => setSelected(template)} className={`block w-full rounded-md border p-3 text-left ${selected?.id === template.id ? 'border-primary' : ''}`}><span className="font-medium">{template.name} · {template.status}</span><span className="mt-1 block text-xs text-muted-foreground">Administration source</span></button>) : <p className="text-sm text-muted-foreground">No templates.</p>}</section>
      {selected ? <section aria-label="Template editor" className="space-y-5 rounded-lg border p-4"><div><h2 className="text-xl font-semibold">Template details</h2><p className="text-sm font-medium">{selected.name}</p><p className="text-sm text-muted-foreground">{scope} source · {selected.status}</p></div><dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Lock mode</dt><dd>{lockMode}</dd></div><div><dt className="text-muted-foreground">Policy</dt><dd>{selected.distributionPolicy ?? 'Not set'}</dd></div><div><dt className="text-muted-foreground">Source scope</dt><dd>{scope === 'SYSTEM' ? 'All wards' : `Stake ${activeStakeId}`}</dd></div></dl><fieldset disabled={selected.status !== 'DRAFT'} className="space-y-3"><label className="block text-sm font-medium">Draft name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-md border p-2" /></label><label className="block text-sm font-medium">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-md border p-2" rows={3} /></label><label className="block text-sm font-medium">Distribution policy<select value={policy} onChange={(event) => setPolicy(event.target.value)} className="mt-1 block w-full rounded-md border p-2"><option value="USE_AS_IS">Use as-is</option><option value="DUPLICATE_AND_CUSTOMIZE">Duplicate and customize</option><option value="REQUIRED">Required</option></select></label><button type="button" onClick={() => void saveMetadata()} className="rounded-md border px-3 py-2 text-sm">Save draft metadata</button></fieldset><div className="flex flex-wrap gap-2"><button type="button" disabled={selected.status === 'ARCHIVED'} onClick={() => void action('publish')} className="rounded-md border px-3 py-2 text-sm">Publish</button><button type="button" disabled={selected.status === 'ARCHIVED'} onClick={() => void action('archive')} className="rounded-md border px-3 py-2 text-sm">Archive</button></div><div><h3 className="font-semibold">Version history</h3>{versions.length ? <ol className="mt-2 space-y-1 text-sm">{versions.map((version) => <li key={version.id}>Version {version.version}{version.schema_version ? ` · schema ${version.schema_version}` : ''}</li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">No versions.</p>}</div></section> : <section className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Select a source to view metadata, policy, lock, and version history.</section>}
    </div>
  </div>;
}
