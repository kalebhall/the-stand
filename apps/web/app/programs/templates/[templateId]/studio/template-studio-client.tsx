'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Block = { id: string; type: string; visibility?: string; config?: { text?: string } };
type Layout = { theme: { fontFamily: string; baseFontSize: number; accentColor: string }; pages: { regions: { blocks: Block[] }[] }[] };
type Template = { name: string; status: string; scopeType: string; version?: { version: number; layout: Layout } | null };

export function TemplateStudioClient({ wardId, templateId, canEdit }: { wardId: string; templateId: string; canEdit: boolean }) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [message, setMessage] = useState('Loading template…');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/w/${encodeURIComponent(wardId)}/document-templates/${encodeURIComponent(templateId)}`)
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to load template'); if (active) { setTemplate(body.template); setLayout(body.template.version?.layout ?? null); setMessage(''); } })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Unable to load template'); });
    return () => { active = false; };
  }, [templateId, wardId]);

  function updateTheme(patch: Partial<Layout['theme']>) { setLayout((current) => current ? { ...current, theme: { ...current.theme, ...patch } } : current); }
  function toggleBlock(blockId: string) {
    setLayout((current) => current ? { ...current, pages: current.pages.map((page) => ({ ...page, regions: page.regions.map((region) => ({ ...region, blocks: region.blocks.map((block) => block.id === blockId ? { ...block, visibility: block.visibility === 'HIDDEN' ? 'VISIBLE' : 'HIDDEN' } : block) })) })) } : current);
  }
  async function saveVersion() {
    if (!layout || !canEdit || !template) return;
    setSaving(true); setMessage('Saving template version…');
    try {
      const response = await fetch(`/api/w/${encodeURIComponent(wardId)}/document-templates/${encodeURIComponent(templateId)}/versions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layout }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to save template version');
      setTemplate((current) => current ? { ...current, version: { ...(current.version ?? { version: 0 }), version: body.version.version, layout } } : current);
      setMessage(`Saved version ${body.version.version}.`);
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Unable to save template version'); }
    finally { setSaving(false); }
  }
  const blocks = layout?.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)) ?? [];

  if (!template || !layout) return <main className="mx-auto max-w-4xl p-6"><p role="status">{message}</p></main>;
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href={`/programs/templates/${encodeURIComponent(templateId)}`} className="text-sm underline">Back to template</Link><h1 className="mt-2 text-3xl font-semibold">Template Studio</h1><p className="text-sm text-muted-foreground">{template.name} · {template.scopeType} · version {template.version?.version ?? 0}</p></div><button type="button" disabled={!canEdit || saving} onClick={() => void saveVersion()} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">{saving ? 'Saving…' : 'Save new version'}</button></div>
    <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{message}</p>
    {!canEdit ? <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">This template is view-only in the current ward context.</p> : null}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="space-y-4 rounded-lg border p-4" aria-label="Template properties"><h2 className="font-semibold">Theme and typography</h2><label className="block text-sm">Font<select disabled={!canEdit} value={layout.theme.fontFamily} onChange={(event) => updateTheme({ fontFamily: event.target.value })} className="mt-1 block w-full rounded border p-2"><option value="SYSTEM_SANS">System sans</option><option value="SERIF">Serif</option><option value="MONOSPACE">Monospace</option></select></label><label className="block text-sm">Base font size<input disabled={!canEdit} type="number" min={8} max={32} value={layout.theme.baseFontSize} onChange={(event) => updateTheme({ baseFontSize: Number(event.target.value) })} className="mt-1 block w-full rounded border p-2" /></label><label className="block text-sm">Accent color<input disabled={!canEdit} type="color" value={layout.theme.accentColor} onChange={(event) => updateTheme({ accentColor: event.target.value })} className="mt-1 block h-10 w-full rounded border p-1" /></label><h2 className="border-t pt-4 font-semibold">Approved blocks</h2><ul className="space-y-2">{blocks.map((block) => <li key={block.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm"><span>{block.type}</span><button type="button" disabled={!canEdit} onClick={() => toggleBlock(block.id)} className="rounded border px-2 py-1">{block.visibility === 'HIDDEN' ? 'Show' : 'Hide'}</button></li>)}</ul></section>
      <section aria-label="Template canvas" className="rounded-lg border bg-muted p-6"><div className="mx-auto min-h-[32rem] max-w-xl rounded-sm bg-background p-8 shadow" style={{ fontFamily: layout.theme.fontFamily === 'SERIF' ? 'serif' : layout.theme.fontFamily === 'MONOSPACE' ? 'monospace' : 'sans-serif', fontSize: `${layout.theme.baseFontSize}px`, borderTop: `8px solid ${layout.theme.accentColor}` }}>{blocks.map((block) => <div key={block.id} className={`mb-4 rounded border p-3 ${block.visibility === 'HIDDEN' ? 'opacity-40 line-through' : ''}`}><div className="text-xs uppercase text-muted-foreground">{block.type}</div><div>{block.config?.text ?? 'Approved dynamic content'}</div></div>)}</div></section>
    </div>
  </main>;
}
