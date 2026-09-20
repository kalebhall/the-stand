'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { renderProgramPreview } from '@/src/document-designer/preview-contract';
import type { DocumentBlock, DocumentLayout } from '@/src/document-designer/types';
import { moveBlock, modeClass, setBlockVisibility, setTheme, type DesignerMode, type SaveState } from './designer-state';

type PreviewSource = { meetingDate: string; meetingType: string; wardName?: string | null; programItems: Array<{ order: number; label: string; details?: string | null }> };
type LoadedDocument = { id: string; layout: DocumentLayout; theme: DocumentLayout['theme']; revision: number; sourceTemplateId: string | null; sourceTemplateVersion: number | null };

type Props = { wardId: string; meetingId: string };

const blockLabel = (block: DocumentBlock) => block.type.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

type TemplateOption = { id: string; name: string; source: string; version?: { layout?: DocumentLayout } | null };

export function ProgramDesignerClient({ wardId, meetingId }: Props) {
  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mode, setMode] = useState<DesignerMode>('EDIT');
  const [publicVisitor, setPublicVisitor] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveState>('loading');
  const [message, setMessage] = useState('Loading program design…');
  const [loaded, setLoaded] = useState(false);
  const initialLayout = useRef<DocumentLayout | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setMessage('Loading program design…');
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/program-design`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Failed to load program design');
    setDocument(body.document);
    setSource(body.previewSource);
    initialLayout.current = body.document.layout;
    setSelectedBlockId(body.document.layout.pages[0]?.regions[0]?.blocks[0]?.id ?? null);
    try {
      const templatesResponse = await fetch(`/api/w/${wardId}/document-templates`);
      const templatesBody = await templatesResponse.json();
      if (templatesResponse.ok) setTemplates(templatesBody.templates ?? []);
    } catch {
      setTemplates([]);
    }
    setLoaded(true);
    setStatus('saved');
    setMessage('Saved');
  }, [meetingId, wardId]);

  useEffect(() => {
    void load().catch((error: unknown) => { setStatus('error'); setMessage(error instanceof Error ? error.message : 'Failed to load program design'); });
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [load]);

  const allBlocks = useMemo(() => document?.layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)) ?? [], [document]);
  const selectedBlock = allBlocks.find((block) => block.id === selectedBlockId) ?? allBlocks[0];

  const save = useCallback(async (nextLayout: DocumentLayout, expectedRevision: number, templateId?: string) => {
    setStatus('saving');
    setMessage('Saving…');
    try {
      const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/program-design`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision, document: nextLayout, ...(templateId ? { templateId } : {}) })
      });
      const body = await response.json();
      if (response.status === 409) {
        setStatus('conflict');
        setMessage('This program changed elsewhere. Your local changes are still here. Reload to discard them.');
        return;
      }
      if (!response.ok) throw new Error(body.error ?? 'Save failed');
      const savedLayout = body.document?.layout ?? body.document ?? nextLayout;
      setDocument((current) => current ? { ...current, layout: savedLayout, theme: savedLayout.theme, revision: body.revision } : current);
      initialLayout.current = savedLayout;
      setStatus('saved');
      setMessage('Saved');
    } catch (error: unknown) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Save failed. Retry when connected.');
    }
  }, [meetingId, wardId]);

  useEffect(() => {
    if (!loaded || !document || !initialLayout.current) return;
    if (JSON.stringify(initialLayout.current) === JSON.stringify(document.layout)) return;
    if (status === 'conflict') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(document.layout, document.revision); }, 650);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [document, loaded, save, status]);

  function updateLayout(nextLayout: DocumentLayout) {
    setDocument((current) => current ? { ...current, layout: nextLayout, theme: nextLayout.theme } : current);
    if (status === 'conflict') setStatus('idle');
  }

  function updateSelectedBlock(mutator: (block: DocumentBlock) => DocumentBlock) {
    if (!document || !selectedBlock) return;
    const next = structuredClone(document.layout);
    for (const page of next.pages) for (const region of page.regions) {
      const index = region.blocks.findIndex((block) => block.id === selectedBlock.id);
      if (index >= 0) { region.blocks[index] = mutator(region.blocks[index]); updateLayout(next); return; }
    }
  }

  let previewHtml = '';
  let previewError = '';
  if (document && source && mode !== 'EDIT') {
    try { previewHtml = renderProgramPreview(document.layout, source, { target: mode === 'PRINT' ? 'PRINT' : 'DIGITAL', publicVisitor }).html.replace(/<main[^>]*>/, '').replace(/<\/main>/, ''); }
    catch (error: unknown) { previewError = error instanceof Error ? error.message : 'Preview unavailable'; }
  }

  if (!document) return <main className="mx-auto max-w-6xl p-6"><p role="status">{message}</p></main>;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-medium text-muted-foreground">Program Designer · Simple Mode</p><h1 className="text-2xl font-semibold">Meeting program</h1><p className="text-sm text-muted-foreground">{source?.meetingDate} · {source?.meetingType.replaceAll('_', ' ')}</p></div>
        <div className="flex flex-wrap items-center gap-2"><Link href="/programs/templates" className="rounded-md border px-3 py-2 text-sm">Templates</Link><span role="status" aria-live="polite" className="min-w-24 text-right text-sm text-muted-foreground">{message}</span></div>
      </header>
      <nav aria-label="Program designer modes" className="flex flex-wrap gap-2 border-b pb-3">
        {(['EDIT', 'DIGITAL', 'PHONE', 'PRINT'] as const).map((value) => <button key={value} type="button" className={`rounded-md px-3 py-2 text-sm ${mode === value ? 'bg-primary text-primary-foreground' : 'border'}`} onClick={() => setMode(value)}>{value === 'EDIT' ? 'Edit' : value === 'DIGITAL' ? 'Desktop preview' : value === 'PHONE' ? 'Phone preview' : 'Print preview'}</button>)}
        {mode !== 'EDIT' ? <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={publicVisitor} onChange={(event) => setPublicVisitor(event.target.checked)} /> Preview as public visitor</label> : null}
      </nav>
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
        <aside className="space-y-3 rounded-lg border bg-card p-3" aria-label="Approved blocks">
          <div><h2 className="font-semibold">Blocks</h2><p className="text-xs text-muted-foreground">Simple Mode blocks from the approved template.</p></div>
          <div className="space-y-2 border-b pb-3"><label className="block space-y-1 text-sm"><span>Approved template</span><select aria-label="Approved template" className="w-full rounded-md border px-2 py-2" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}><option value="">Keep current template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.source}</option>)}</select></label><button type="button" className="w-full rounded-md border px-2 py-2 text-sm" disabled={!selectedTemplateId || status === 'saving'} onClick={() => { if (document && selectedTemplateId) void save(document.layout, document.revision, selectedTemplateId); }}>Use approved template</button></div>
          <ul className="space-y-1">{allBlocks.map((block, index) => <li key={block.id}><button type="button" className={`w-full rounded-md border px-2 py-2 text-left text-sm ${selectedBlock?.id === block.id ? 'border-primary bg-primary/10' : ''}`} onClick={() => setSelectedBlockId(block.id)}>{blockLabel(block)}<span className="block text-xs text-muted-foreground">{block.visibility}</span></button><div className="mt-1 flex gap-1"><button type="button" className="rounded border px-2 text-xs" aria-label={`Move ${blockLabel(block)} up`} disabled={index === 0} onClick={() => updateLayout(moveBlock(document.layout, block.id, -1))}>↑</button><button type="button" className="rounded border px-2 text-xs" aria-label={`Move ${blockLabel(block)} down`} disabled={index === allBlocks.length - 1} onClick={() => updateLayout(moveBlock(document.layout, block.id, 1))}>↓</button></div></li>)}</ul>
        </aside>
        <section className={`min-h-[620px] overflow-auto rounded-lg border bg-muted/30 p-4 ${modeClass(mode)}`} aria-label="Document canvas">
          {mode === 'EDIT' ? <div className="mx-auto space-y-3 rounded-md bg-background p-6 shadow-sm"><div className="text-sm text-muted-foreground">Document canvas · {document.layout.paper} · {document.layout.orientation} · {document.layout.fold}</div>{allBlocks.map((block) => <button type="button" key={block.id} onClick={() => setSelectedBlockId(block.id)} className={`block w-full rounded border p-3 text-left ${block.visibility === 'HIDDEN' ? 'opacity-40' : ''} ${selectedBlock?.id === block.id ? 'border-primary' : ''}`}><strong>{blockLabel(block)}</strong><span className="ml-2 text-sm text-muted-foreground">{block.visibility}</span></button>)}</div> : previewError ? <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{previewError}</p> : <div className="mx-auto bg-background shadow-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />}
        </section>
        <aside className="space-y-4 rounded-lg border bg-card p-3" aria-label="Simple Mode properties">
          <section><h2 className="font-semibold">Properties</h2>{selectedBlock ? <div className="mt-3 space-y-3"><p className="text-sm font-medium">{blockLabel(selectedBlock)}</p><label className="block space-y-1 text-sm"><span>Visibility</span><select className="w-full rounded-md border px-2 py-2" value={selectedBlock.visibility} onChange={(event) => updateLayout(setBlockVisibility(document.layout, selectedBlock.id, event.target.value as 'VISIBLE' | 'HIDDEN' | 'HIDE_WHEN_EMPTY'))}><option value="VISIBLE">Visible</option><option value="HIDDEN">Hidden</option><option value="HIDE_WHEN_EMPTY">Hide when empty</option></select></label>{'text' in selectedBlock.config ? <label className="block space-y-1 text-sm"><span>Text</span><textarea className="min-h-24 w-full rounded-md border p-2" value={String(selectedBlock.config.text)} onChange={(event) => updateSelectedBlock((block) => ({ ...block, config: { ...block.config, text: event.target.value } } as DocumentBlock))} /></label> : null}</div> : <p className="mt-2 text-sm text-muted-foreground">Select a block to edit safe properties.</p>}</section>
          <section><h2 className="font-semibold">Theme</h2><div className="mt-3 space-y-3"><label className="block space-y-1 text-sm"><span>Font</span><select className="w-full rounded-md border px-2 py-2" value={document.layout.theme.fontFamily} onChange={(event) => updateLayout(setTheme(document.layout, { fontFamily: event.target.value as DocumentLayout['theme']['fontFamily'] }))}><option value="SYSTEM_SANS">System sans</option><option value="SERIF">Serif</option><option value="MONOSPACE">Monospace</option></select></label><label className="block space-y-1 text-sm"><span>Base font size</span><input className="w-full rounded-md border px-2 py-2" type="number" min={8} max={32} value={document.layout.theme.baseFontSize} onChange={(event) => updateLayout(setTheme(document.layout, { baseFontSize: Number(event.target.value) }))} /></label></div></section>
          {status === 'conflict' ? <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><p>{message}</p><button type="button" className="rounded border px-2 py-1" onClick={() => void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Reload failed'))}>Reload server version</button></div> : null}
          {status === 'error' ? <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => document && void save(document.layout, document.revision)}>Retry save</button> : null}
          <p className="text-xs text-muted-foreground">Save updates this private draft only. Publishing remains a separate action.</p>
        </aside>
      </div>
    </main>
  );
}
