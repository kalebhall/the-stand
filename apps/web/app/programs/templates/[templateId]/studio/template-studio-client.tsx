'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type Block = { id: string; type: string; visibility?: string; config?: { text?: string } };
type Layout = { theme: { fontFamily: string; baseFontSize: number; accentColor: string }; pages: { regions: { blocks: Block[] }[] }[] };
type Template = { name: string; status: string; scopeType: string; version?: { version: number; layout: Layout } | null };

export function TemplateStudioClient({ templateId, canEdit, apiBase, backHref = `/programs/templates/${encodeURIComponent(templateId)}` }: { templateId: string; canEdit: boolean; apiBase: string; backHref?: string }) {
  const t = useTranslations('programs');
  const localizedError = (body: { code?: string }, fallback: string) => {
    const key = body.code === 'FORBIDDEN' ? 'forbiddenError' : body.code === 'NOT_FOUND' ? 'notFoundError' : body.code === 'IMMUTABLE_TEMPLATE' ? 'immutableTemplateError' : body.code === 'INTERNAL_ERROR' ? 'internalError' : null;
    return key ? t(key) : fallback;
  };
  const [template, setTemplate] = useState<Template | null>(null);
  const blockTypeLabel = (type: string) => { const key = `blockType.${type}` as never; return t.has(key) ? t(key) : t('approvedBlocks'); };
  const statusLabel = template?.status === 'DRAFT' ? t('draftStatus') : template?.status === 'PUBLISHED' ? t('published') : t('archived');
  const scopeLabel = template?.scopeType === 'SYSTEM' ? t('system') : template?.scopeType === 'STAKE' ? t('stakeTemplates') : template?.scopeType === 'WARD' ? t('wardTemplates') : template?.scopeType === 'PERSONAL_DRAFT' ? t('myDrafts') : t('scope');
  const [layout, setLayout] = useState<Layout | null>(null);
  const [message, setMessage] = useState(t('loadingTemplate'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/${encodeURIComponent(templateId)}`)
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(localizedError(body, t('failedLoadTemplate'))); if (active) { setTemplate(body.template); setLayout(body.template.version?.layout ?? null); setMessage(''); } })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : t('failedLoadTemplate')); });
    return () => { active = false; };
  }, [templateId, apiBase, t]);

  const effectiveCanEdit = canEdit && template?.status === 'DRAFT';

  function updateTheme(patch: Partial<Layout['theme']>) { setLayout((current) => current ? { ...current, theme: { ...current.theme, ...patch } } : current); }
  function toggleBlock(blockId: string) {
    setLayout((current) => current ? { ...current, pages: current.pages.map((page) => ({ ...page, regions: page.regions.map((region) => ({ ...region, blocks: region.blocks.map((block) => block.id === blockId ? { ...block, visibility: block.visibility === 'HIDDEN' ? 'VISIBLE' : 'HIDDEN' } : block) })) })) } : current);
  }
  async function saveVersion() {
    if (!layout || !effectiveCanEdit || !template) return;
    setSaving(true); setMessage(t('savingTemplateVersion'));
    try {
      const response = await fetch(`${apiBase}/${encodeURIComponent(templateId)}/versions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layout }) });
      const body = await response.json();
      if (!response.ok) throw new Error(localizedError(body, t('failedSaveTemplateVersion')));
      setTemplate((current) => current ? { ...current, version: { ...(current.version ?? { version: 0 }), version: body.version.version, layout } } : current);
      setMessage(`${t('saved')} ${t('version')} ${body.version.version}.`);
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : t('failedSaveTemplateVersion')); }
    finally { setSaving(false); }
  }
  const blocks = layout?.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)) ?? [];

  if (!template || !layout) return <main className="mx-auto max-w-4xl p-6"><p role="status">{message}</p></main>;
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href={backHref} className="text-sm underline">{t('backToTemplate')}</Link><h1 className="mt-2 text-3xl font-semibold">{t('templateStudio')}</h1><p className="text-sm text-muted-foreground">{template.name} · {scopeLabel} · {t('status')}: {statusLabel} · {t('version')} {template.version?.version ?? 0}</p></div><button type="button" disabled={!effectiveCanEdit || saving} onClick={() => void saveVersion()} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">{saving ? t('saving') : t('saveNewVersion')}</button></div>
    <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{message}</p>
    {!effectiveCanEdit ? <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">{t('templateViewOnly')}</p> : null}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="space-y-4 rounded-lg border p-4" aria-label={t('properties')}><h2 className="font-semibold">{t('templateThemeTypography')}</h2><label className="block text-sm">{t('font')}<select disabled={!effectiveCanEdit} value={layout.theme.fontFamily} onChange={(event) => updateTheme({ fontFamily: event.target.value })} className="mt-1 block w-full rounded border p-2"><option value="SYSTEM_SANS">{t('systemSans')}</option><option value="SERIF">{t('serif')}</option><option value="MONOSPACE">{t('monospace')}</option></select></label><label className="block text-sm">{t('baseFontSize')}<input disabled={!effectiveCanEdit} type="number" min={8} max={32} value={layout.theme.baseFontSize} onChange={(event) => updateTheme({ baseFontSize: Number(event.target.value) })} className="mt-1 block w-full rounded border p-2" /></label><label className="block text-sm">{t('accentColor')}<input disabled={!effectiveCanEdit} type="color" value={layout.theme.accentColor} onChange={(event) => updateTheme({ accentColor: event.target.value })} className="mt-1 block h-10 w-full rounded border p-1" /></label><h2 className="border-t pt-4 font-semibold">{t('approvedBlocks')}</h2><ul className="space-y-2">{blocks.map((block) => <li key={block.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm"><span>{blockTypeLabel(block.type)}</span><button type="button" disabled={!effectiveCanEdit} onClick={() => toggleBlock(block.id)} className="rounded border px-2 py-1">{block.visibility === 'HIDDEN' ? t('showBlock') : t('hideBlock')}</button></li>)}</ul></section>
      <section aria-label={t('templateCanvas')} className="rounded-lg border bg-muted p-6"><div className="mx-auto min-h-[32rem] max-w-xl rounded-sm bg-background p-8 shadow" style={{ fontFamily: layout.theme.fontFamily === 'SERIF' ? 'serif' : layout.theme.fontFamily === 'MONOSPACE' ? 'monospace' : 'sans-serif', fontSize: `${layout.theme.baseFontSize}px`, borderTop: `8px solid ${layout.theme.accentColor}` }}>{blocks.map((block) => <div key={block.id} className={`mb-4 rounded border p-3 ${block.visibility === 'HIDDEN' ? 'opacity-40 line-through' : ''}`}><div className="text-xs uppercase text-muted-foreground">{blockTypeLabel(block.type)}</div><div>{block.config?.text ?? t('approvedDynamicContent')}</div></div>)}</div></section>
    </div>
  </main>;
}
