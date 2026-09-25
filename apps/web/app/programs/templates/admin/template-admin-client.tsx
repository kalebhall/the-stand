'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

type Scope = 'SYSTEM' | 'STAKE';
type Template = { id: string; name: string; description?: string | null; status: string; scopeType: Scope; distributionPolicy?: string | null; version?: { version?: number; lock?: unknown } | null };
type Version = { id: string; version: number; schema_version?: number; created_at?: string; lock_json?: unknown };

function readLockMode(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'mode' in value && typeof value.mode === 'string') return value.mode;
  return 'UNLOCKED';
}

const emptyLayout = { schemaVersion: 1, documentType: 'SACRAMENT_PROGRAM', paper: 'LETTER', orientation: 'PORTRAIT', fold: 'BIFOLD', theme: { fontFamily: 'SYSTEM_SANS', baseFontSize: 12, accentColor: '#1f2937' }, pages: [{ id: 'page-1', regions: [{ id: 'region-1', ratio: 1, gutter: 0, blocks: [{ id: 'block-1', type: 'DOCUMENT_TITLE', width: 'FULL', dataMode: 'AUTO', visibility: 'VISIBLE', printBehavior: 'PRINT_AND_DIGITAL', digitalBehavior: 'NORMAL', config: { text: 'Sacrament Meeting' } }] }] }] };

export function TemplateAdminClient({ activeStakeId, canSystem, canStake }: { activeStakeId: string | null; canSystem: boolean; canStake: boolean }) {
  const t = useTranslations('programs');
  const [scope, setScope] = useState<Scope>(canSystem ? 'SYSTEM' : 'STAKE');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [lockMode, setLockMode] = useState('UNLOCKED');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [policy, setPolicy] = useState('DUPLICATE_AND_CUSTOMIZE');
  const [message, setMessage] = useState(t('loadingTemplates'));
  const base = scope === 'SYSTEM' ? '/api/support/document-templates' : `/api/stakes/${encodeURIComponent(activeStakeId ?? '')}/document-templates`;

  async function request(path = '', init?: RequestInit) {
    const response = await fetch(`${base}${path}`, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? t('requestFailed'));
    return body;
  }
  async function load() {
    try { const body = await request(); const nextTemplates = body.templates ?? []; setTemplates(nextTemplates); setSelected(nextTemplates[0] ?? null); setMessage(''); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : t('failedLoadTemplates')); }
  }
  useEffect(() => { void load(); }, [scope, activeStakeId]);
  useEffect(() => {
    if (!selected) { setVersions([]); setLockMode('UNLOCKED'); return; }
    setName(selected.name); setDescription(selected.description ?? ''); setPolicy(selected.distributionPolicy ?? 'DUPLICATE_AND_CUSTOMIZE');
    void request(`/${encodeURIComponent(selected.id)}/versions`).then((body) => { const nextVersions = body.versions ?? []; setVersions(nextVersions); setLockMode(readLockMode(nextVersions[0]?.lock_json)); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : t('failedLoadHistory')));
  }, [selected]);

  const canUseScope = useMemo(() => scope === 'SYSTEM' ? canSystem : canStake, [scope, canStake, canSystem]);
  async function createDraft() {
    try { const body = await request('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: t('newDraft'), description: '', distributionPolicy: 'DUPLICATE_AND_CUSTOMIZE', layout: emptyLayout }) }); setMessage(t('draftCreated')); await load(); setSelected(body.template); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : t('failedCreateDraft')); }
  }
  async function saveMetadata() {
    if (!selected) return;
    try { await request(`/${encodeURIComponent(selected.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, description, distributionPolicy: policy }) }); setMessage(t('draftMetadataSaved')); await load(); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : t('failedSaveMetadata')); }
  }
  async function action(action: 'publish' | 'archive') {
    if (!selected) return;
    try { await request(`/${encodeURIComponent(selected.id)}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: action === 'publish' ? JSON.stringify({}) : undefined }); setMessage(t(action === 'publish' ? 'published' : 'archived')); await load(); }
    catch (error: unknown) { setMessage(error instanceof Error ? error.message : t('failedAction', { action })); }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('templateScope')}>
      {canSystem ? <button type="button" role="tab" aria-selected={scope === 'SYSTEM'} onClick={() => setScope('SYSTEM')} className="rounded-md border px-3 py-2 text-sm">{t('systemSources')}</button> : null}
      {canStake ? <button type="button" role="tab" aria-selected={scope === 'STAKE'} onClick={() => setScope('STAKE')} className="rounded-md border px-3 py-2 text-sm">{t('stakeSources')}</button> : null}
      {canUseScope ? <button type="button" onClick={() => void createDraft()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">{t('newDraft')}</button> : null}
    </div>
    <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{message}</p>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section aria-label={t('templateSources')} className="space-y-2 rounded-lg border p-4"><h2 className="font-semibold">{t('templates', { scope: scope === 'SYSTEM' ? t('system') : t('stake') })}</h2>{templates.length ? templates.map((template) => <button type="button" key={template.id} onClick={() => setSelected(template)} className={`block w-full rounded-md border p-3 text-left ${selected?.id === template.id ? 'border-primary' : ''}`}><span className="font-medium">{template.name} · {template.status}</span><span className="mt-1 block text-xs text-muted-foreground">{t('administrationSource')}</span></button>) : <p className="text-sm text-muted-foreground">{t('noTemplates')}</p>}</section>
      {selected ? <section aria-label={t('templateEditor')} className="space-y-5 rounded-lg border p-4"><div><h2 className="text-xl font-semibold">{t('templateDetails')}</h2><p className="text-sm font-medium">{selected.name}</p><p className="text-sm text-muted-foreground">{scope} source · {selected.status}</p></div><dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">{t('lockMode')}</dt><dd>{lockMode}</dd></div><div><dt className="text-muted-foreground">{t('policy')}</dt><dd>{selected.distributionPolicy ?? 'Not set'}</dd></div><div><dt className="text-muted-foreground">{t('sourceScope')}</dt><dd>{scope === 'SYSTEM' ? 'All wards' : `Stake ${activeStakeId}`}</dd></div></dl><fieldset disabled={selected.status !== 'DRAFT'} className="space-y-3"><label className="block text-sm font-medium">{t('draftName')}<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-md border p-2" /></label><label className="block text-sm font-medium">{t('descriptionLabel')}<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-md border p-2" rows={3} /></label><label className="block text-sm font-medium">{t('distributionPolicy')}<select value={policy} onChange={(event) => setPolicy(event.target.value)} className="mt-1 block w-full rounded-md border p-2"><option value="USE_AS_IS">{t('useAsIs')}</option><option value="DUPLICATE_AND_CUSTOMIZE">{t('duplicateCustomize')}</option><option value="REQUIRED">{t('required')}</option></select></label><button type="button" onClick={() => void saveMetadata()} className="rounded-md border px-3 py-2 text-sm">{t('saveDraftMetadata')}</button></fieldset><div className="flex flex-wrap gap-2"><button type="button" disabled={selected.status === 'ARCHIVED'} onClick={() => void action('publish')} className="rounded-md border px-3 py-2 text-sm">{t('publish')}</button><button type="button" disabled={selected.status === 'ARCHIVED'} onClick={() => void action('archive')} className="rounded-md border px-3 py-2 text-sm">{t('archive')}</button></div><div><h3 className="font-semibold">{t('versionHistory')}</h3>{versions.length ? <ol className="mt-2 space-y-1 text-sm">{versions.map((version) => <li key={version.id}>Version {version.version}{version.schema_version ? ` · schema ${version.schema_version}` : ''}</li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">{t('noVersions')}</p>}</div></section> : <section className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{t('selectSource')}</section>}
    </div>
  </div>;
}
