'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { renderProgramPreview } from '@/src/document-designer/preview-contract';
import { downgradeToV1, normalizeToAdvanced, type AdvancedDocumentLayout } from '@/src/document-designer/advanced-schema';
import { addBlock, configureColumns, moveBlockToColumn, reorderBlock, removeBlock, resizeBlock, setAdvancedBlockVisibility } from '@/src/document-designer/layout-operations';
import { commitHistory, createHistory, redo, undo, type HistoryState } from '@/src/document-designer/history';
import type { DocumentBlock, DocumentLayout } from '@/src/document-designer/types';
import type { MediaAssetResponse } from '@/src/document-designer/media-types';
import type { PrintValidationResult } from '@/src/document-designer/print-types';

import { moveBlock, modeClass, setBlockVisibility, setTheme, type DesignerMode, type SaveState } from './designer-state';

type PreviewSource = { meetingDate: string; meetingType: string; wardName?: string | null; programItems: Array<{ order: number; label: string; details?: string | null }>; media?: Partial<Record<string, { url: string; altText: string | null; isDecorative: boolean }>> };
type LoadedDocument = { id: string; layout: DocumentLayout; advancedLayout?: AdvancedDocumentLayout; theme: DocumentLayout['theme']; revision: number; sourceTemplateId: string | null; sourceTemplateVersion: number | null };

type Props = { wardId: string; meetingId: string };

const blockLabel = (block: DocumentBlock) => block.type.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const PANEL_LABELS = ['frontCover', 'insideLeft', 'insideRight', 'backCover'] as const;


type TemplateOption = { id: string; name: string; source: string; scopeType?: string; status?: string; distributionPolicy?: string | null; version?: { version?: number; lock?: unknown } | null };

export function ProgramDesignerClient({ wardId, meetingId }: Props) {
  const t = useTranslations('programs');
  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [media, setMedia] = useState<MediaAssetResponse[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mode, setMode] = useState<DesignerMode>('EDIT');
  const [publicVisitor, setPublicVisitor] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState(0);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [advancedEnabled, setAdvancedEnabled] = useState(false);
  const [advancedEditing, setAdvancedEditing] = useState(false);
  const [printValidation, setPrintValidation] = useState<PrintValidationResult | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState | null>(null);
  const [status, setStatus] = useState<SaveState>('loading');
  const [message, setMessage] = useState(t('loadingDesign'));
  const [loaded, setLoaded] = useState(false);
  const initialLayout = useRef<DocumentLayout | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setMessage(t('loadingDesign'));
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/program-design`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? t('failedLoadDesign'));
    setDocument({ ...body.document, advancedLayout: body.document.advancedLayout });
    setAdvancedEnabled(body.simpleMode?.advancedModeAvailable === true);
    if (body.document.advancedLayout) setHistoryState(createHistory(body.document.advancedLayout));
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
    try {
      const mediaResponse = await fetch(`/api/w/${wardId}/media`);
      const mediaBody = await mediaResponse.json();
      if (mediaResponse.ok) {
        const loadedMedia = mediaBody.media ?? [];
        setMedia(loadedMedia);
        setSource((current) => current ? { ...current, media: Object.fromEntries(loadedMedia.filter((asset: MediaAssetResponse) => asset.url).map((asset: MediaAssetResponse) => [asset.id, { url: asset.url as string, altText: asset.alt_text, isDecorative: asset.is_decorative }])) } : current);
      }
    } catch {
      setMedia([]);
    }
    setLoaded(true);
    setStatus('saved');
    setMessage(t('saved'));
  }, [meetingId, t, wardId]);

  useEffect(() => {
    void load().catch((error: unknown) => { setStatus('error'); setMessage(error instanceof Error ? error.message : t('failedLoadDesign')); });
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [load, t]);

  const allBlocks = useMemo(() => document?.layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)) ?? [], [document]);
  const panelBlocks = (panelIndex: number) => document?.layout.pages[0]?.regions[panelIndex]?.blocks ?? [];
  const panelForBlock = (blockId: string) => document?.layout.pages[0]?.regions.findIndex((region) => region.blocks.some((block) => block.id === blockId)) ?? -1;
  const selectedBlock = allBlocks.find((block) => block.id === selectedBlockId) ?? allBlocks[0];
  const isBifold = document?.layout.fold === 'BIFOLD';
  const panelLabels = isBifold ? PANEL_LABELS.map((key) => t(key)) : (document?.layout.pages[0]?.regions.map((_, index) => `Region ${index + 1}`) ?? []);

  const save = useCallback(async (nextLayout: DocumentLayout | AdvancedDocumentLayout, expectedRevision: number, templateId?: string, saveMode: 'SIMPLE' | 'ADVANCED' = 'SIMPLE') => {
    setStatus('saving');
    setMessage(t('saving'));
    try {
      const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/program-design`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision, document: nextLayout, mode: saveMode, ...(templateId ? { templateId } : {}) })
      });
      const body = await response.json();
      if (response.status === 409) {
        setStatus('conflict');
        setMessage(t('changedElsewhere'));
        return;
      }
      if (!response.ok) throw new Error(body.error ?? t('saveFailed'));
      const savedLayout = body.document?.layout ?? (body.document?.schemaVersion === 2 ? downgradeToV1(body.document) : body.document) ?? nextLayout;
      setDocument((current) => current ? { ...current, layout: savedLayout, advancedLayout: body.document?.schemaVersion === 2 ? body.document : current.advancedLayout, theme: savedLayout.theme, revision: body.revision } : current);
      initialLayout.current = savedLayout;
      setStatus('saved');
      setMessage(t('saved'));
    } catch (error: unknown) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : t('retryConnected'));
    }
  }, [meetingId, wardId]);

  useEffect(() => {
    if (!loaded || advancedEditing || !document || !initialLayout.current) return;
    if (JSON.stringify(initialLayout.current) === JSON.stringify(document.layout)) return;
    if (status === 'conflict') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(document.layout, document.revision); }, 650);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [advancedEditing, document, loaded, save, status]);

  function updateLayout(nextLayout: DocumentLayout) {
    setDocument((current) => current ? { ...current, layout: nextLayout, theme: nextLayout.theme } : current);
    if (status === 'conflict') setStatus('idle');
  }

  function updateSelectedBlock(mutator: (block: DocumentBlock) => DocumentBlock) {
    if (!document || !selectedBlock) return;
    if (advancedEditing) {
      const current = currentAdvanced();
      if (!current) return;
      const next = structuredClone(current);
      for (const page of next.pages) for (const region of page.regions) {
        const index = region.blocks.findIndex((block) => block.id === selectedBlock.id);
        if (index >= 0) { region.blocks[index] = { ...region.blocks[index], ...mutator(region.blocks[index]) }; runLayoutOperation(() => applyAdvanced(next)); return; }
      }
      return;
    }
    const next = structuredClone(document.layout);
    for (const page of next.pages) for (const region of page.regions) {
      const index = region.blocks.findIndex((block) => block.id === selectedBlock.id);
      if (index >= 0) { region.blocks[index] = mutator(region.blocks[index]); updateLayout(next); return; }
    }
  }

  function updateAdvancedVisibility(value: DocumentBlock['visibility']) {
    const current = currentAdvanced();
    if (current && selectedBlockId) runLayoutOperation(() => applyAdvanced(setAdvancedBlockVisibility(current, selectedBlockId, value)));
  }

  function moveSelectedBlock(delta: -1 | 1) {
    if (advancedEditing) { const current = currentAdvanced(); if (current && selectedBlockId) runLayoutOperation(() => applyAdvanced(reorderBlock(current, selectedBlockId, delta))); return; }
    if (document && selectedBlockId) updateLayout(moveBlock(document.layout, selectedBlockId, delta));
  }

  function updateTheme(theme: Partial<DocumentLayout['theme']>) {
    if (advancedEditing) { const current = currentAdvanced(); if (current) runLayoutOperation(() => applyAdvanced({ ...current, theme: { ...current.theme, ...theme } })); return; }
    if (document) updateLayout(setTheme(document.layout, theme));
  }

  function applyAdvanced(next: AdvancedDocumentLayout) {
    setHistoryState((current) => current ? commitHistory(current, next) : createHistory(next));
    setDocument((current) => current ? { ...current, advancedLayout: next, layout: downgradeToV1(next), theme: next.theme } : current);
    setOperationError(null);
  }

  function runLayoutOperation(operation: () => void) {
    try {
      operation();
      setOperationError(null);
    } catch (error: unknown) {
      setOperationError(error instanceof Error ? error.message : t('layoutNotAllowed'));
    }
  }

  function moveBlockToPanel(blockId: string, targetPanel: number) {
    if (!document || !advancedEditing || panelForBlock(blockId) === targetPanel) return;
    runLayoutOperation(() => {
      const current = currentAdvanced();
      if (current) applyAdvanced(moveBlockToColumn(current, blockId, 0, targetPanel, 0));
    });
  }

  function currentAdvanced(): AdvancedDocumentLayout | null {
    return document?.advancedLayout ?? (document ? normalizeToAdvanced(document.layout) : null);
  }

  function undoAdvanced() {
    if (!historyState) return;
    const next = undo(historyState);
    setHistoryState(next);
    setDocument((current) => current ? { ...current, advancedLayout: next.present, layout: downgradeToV1(next.present), theme: next.present.theme } : current);
  }

  function redoAdvanced() {
    if (!historyState) return;
    const next = redo(historyState);
    setHistoryState(next);
    setDocument((current) => current ? { ...current, advancedLayout: next.present, layout: downgradeToV1(next.present), theme: next.present.theme } : current);
  }

  function addAdvancedTextBlock() {
    const current = currentAdvanced();
    if (!current) return;
    const block: DocumentBlock = { id: crypto.randomUUID() as DocumentBlock['id'], type: 'CUSTOM_TEXT', width: 'FULL', dataMode: 'MANUAL', visibility: 'VISIBLE', printBehavior: 'PRINT_AND_DIGITAL', digitalBehavior: 'NORMAL', config: { text: t('newTextBlock') } };
    runLayoutOperation(() => applyAdvanced(addBlock(current, 0, selectedPanelIndex, block)));
  }

  function removeSelectedAdvancedBlock() {
    const current = currentAdvanced();
    if (current && selectedBlockId) runLayoutOperation(() => applyAdvanced(removeBlock(current, selectedBlockId)));
  }

  async function uploadMedia(file: File, altText: string, isDecorative: boolean) {
    const form = new FormData();
    form.set('file', file);
    form.set('altText', altText);
    form.set('isDecorative', String(isDecorative));
    const response = await fetch(`/api/w/${wardId}/media`, { method: 'POST', body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? t('uploadFailed'));
    const asset = body.media as MediaAssetResponse;
    setMedia((current) => [asset, ...current]);
    setSource((current) => current ? { ...current, media: { ...current.media, ...(asset.url ? { [asset.id]: { url: asset.url, altText: asset.alt_text, isDecorative: asset.is_decorative } } : {}) } } : current);
    return asset;
  }

  function selectImageAsset(asset: MediaAssetResponse) {
    if (selectedBlock?.type !== 'IMAGE' || !asset.url) return;
    updateSelectedBlock((block) => ({ ...block, config: { assetId: asset.id, alt: asset.alt_text ?? '', isDecorative: asset.is_decorative } } as DocumentBlock));
  }
  function saveAdvanced() {
    const current = currentAdvanced();
    if (current && document) void save(current, document.revision, undefined, 'ADVANCED');
  }

  async function validatePrint() {
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/program-design/print-validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'draft' })
    });
    const body = await response.json() as PrintValidationResult & { error?: string };
    if (!response.ok) throw new Error(body.error ?? t('printValidationFailed'));
    setPrintValidation(body);
  }

  function downloadPdf(sourceName: 'draft' | 'published') {
    window.open(`/api/w/${encodeURIComponent(wardId)}/meetings/${encodeURIComponent(meetingId)}/program-design/pdf?source=${sourceName}`, '_blank', 'noopener,noreferrer');
  }


  let previewHtml = '';
  let previewError = '';
  if (document && source && mode !== 'EDIT') {
    try { previewHtml = renderProgramPreview(document.advancedLayout ?? document.layout, source, { target: mode === 'PRINT' ? 'PRINT' : 'DIGITAL', publicVisitor }).html.replace(/<main[^>]*>/, '').replace(/<\/main>/, ''); }
    catch (error: unknown) { previewError = error instanceof Error ? error.message : t('previewUnavailable'); }
  }

  if (!document) return <main className="mx-auto max-w-6xl p-6"><p role="status">{message}</p></main>;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-medium text-muted-foreground">{t('designerSimple')}</p><h1 className="text-2xl font-semibold">{t('meetingProgram')}</h1><p className="text-sm text-muted-foreground">{source?.meetingDate} · {source?.meetingType.replaceAll('_', ' ')}</p></div>
        <div className="flex flex-wrap items-center gap-2"><Link href="/programs/templates" className="rounded-md border px-3 py-2 text-sm">{t('templates')}</Link><span role="status" aria-live="polite" className="min-w-24 text-right text-sm text-muted-foreground">{message}</span></div>
      </header>
      <nav aria-label={t('designerModes')} className="flex flex-wrap gap-2 border-b pb-3">
        {(['EDIT', 'DIGITAL', 'PHONE', 'PRINT'] as const).map((value) => <button key={value} type="button" className={`rounded-md px-3 py-2 text-sm ${mode === value ? 'bg-primary text-primary-foreground' : 'border'}`} onClick={() => setMode(value)}>{value === 'EDIT' ? t('edit') : value === 'DIGITAL' ? t('desktopPreview') : value === 'PHONE' ? t('phonePreview') : t('printPreview')}</button>)}
        {advancedEnabled ? <button type="button" className={`rounded-md px-3 py-2 text-sm ${advancedEditing ? 'bg-primary text-primary-foreground' : 'border'}`} onClick={() => setAdvancedEditing((value) => !value)}>{advancedEditing ? t('simpleMode') : t('advancedMode')}</button> : null}
        {mode !== 'EDIT' ? <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={publicVisitor} onChange={(event) => setPublicVisitor(event.target.checked)} /> {t('previewPublic')}</label> : null}
      </nav>
      <section aria-label={t('templateMetadata')} className="rounded-md border bg-card p-3 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span><span className="font-medium">{t('sourceScope')}</span> {templates.find((template) => template.id === document.sourceTemplateId)?.scopeType ?? (document.sourceTemplateId ? t('unavailable') : t('systemBuiltIn'))}</span>
          <span><span className="font-medium">{t('publicationVersion')}</span> {document.sourceTemplateVersion ? `v${document.sourceTemplateVersion}` : 'Draft layout'}</span>
          <span><span className="font-medium">{t('lock')}</span> {document.sourceTemplateId && templates.find((template) => template.id === document.sourceTemplateId)?.version?.lock ? t('lockedSourceBlocks') : t('noSourceLock')}</span>
          <span><span className="font-medium">{t('templatePolicy')}</span> {t('templatePolicyCopy')}</span>
        </div>
      </section>
      {mode === 'PRINT' ? <section aria-label={t('printActions')} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3"><button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void validatePrint().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Print validation failed'))}>{t('validatePrint')}</button><button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => downloadPdf('draft')}>{t('downloadDraftPdf')}</button><button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => downloadPdf('published')}>{t('downloadPublishedPdf')}</button>{printValidation ? <span className={`text-sm ${printValidation.valid ? 'text-green-700' : 'text-red-700'}`}>{printValidation.valid ? `Ready · ${printValidation.pageCount} page${printValidation.pageCount === 1 ? '' : 's'}` : `${printValidation.errors.length} print error${printValidation.errors.length === 1 ? '' : 's'}`}</span> : null}</section> : null}
      {mode === 'PRINT' && printValidation && !printValidation.valid ? <section aria-label={t('printDiagnostics')} className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900"><h2 className="font-semibold">{t('printDiagnostics')}</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{[...printValidation.errors, ...printValidation.warnings].map((issue, index) => <li key={`${issue.code}-${issue.blockId ?? 'document'}-${index}`}>{issue.message}{issue.suggestion ? ` ${issue.suggestion}` : ''}</li>)}</ul></section> : null}
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
        <aside className="space-y-3 rounded-lg border bg-card p-3" aria-label={t('approvedBlocks')}>
          <div><h2 className="font-semibold">{t('blocks')}</h2><p className="text-xs text-muted-foreground">{t('simpleBlocksDescription')}</p></div>
          {advancedEditing ? <section className="space-y-2 border-b pb-3" aria-label={t('advancedControls')}><h3 className="font-medium">{t('spatialLayout')}</h3><p className="text-xs text-muted-foreground">{t('spatialDescription')}</p><label className="block space-y-1 text-xs"><span>{t('targetPanel')}</span><select className="w-full rounded border px-2 py-2" value={selectedPanelIndex} onChange={(event) => setSelectedPanelIndex(Number(event.target.value))}>{panelLabels.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label><label className="block space-y-1 text-xs"><span>Move selected block to</span><select className="w-full rounded border px-2 py-2" value={selectedBlockId ? Math.max(panelForBlock(selectedBlockId), 0) : selectedPanelIndex} disabled={!selectedBlockId} onChange={(event) => moveBlockToPanel(selectedBlockId ?? '', Number(event.target.value))}>{panelLabels.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label><div className="grid grid-cols-2 gap-1"><button type="button" className="rounded border px-2 py-2 text-xs" onClick={addAdvancedTextBlock}>Add to panel</button><button type="button" className="rounded border px-2 py-2 text-xs" disabled={!selectedBlockId} onClick={removeSelectedAdvancedBlock}>Remove selected</button><button type="button" className="rounded border px-2 py-2 text-xs" disabled={!historyState?.past.length} onClick={undoAdvanced}>Undo</button><button type="button" className="rounded border px-2 py-2 text-xs" disabled={!historyState?.future.length} onClick={redoAdvanced}>Redo</button></div><label className="block space-y-1 text-xs"><span>Columns in selected panel</span><select className="w-full rounded border px-2 py-2" value={currentAdvanced()?.pages[0]?.regions[selectedPanelIndex]?.columns.count ?? 1} onChange={(event) => { const current = currentAdvanced(); if (current) runLayoutOperation(() => applyAdvanced(configureColumns(current, 0, selectedPanelIndex, Number(event.target.value) as 1 | 2 | 3, Number(event.target.value) === 1 ? '1/1' : Number(event.target.value) === 2 ? '1/3+2/3' : '1/1', 8))); }}><option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option></select></label><button type="button" className="w-full rounded border px-2 py-2 text-sm" onClick={saveAdvanced} disabled={status === 'saving'}>Save Advanced Layout</button></section> : null}
          {operationError ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">{operationError}</p> : null}
          {selectedBlock?.type === 'IMAGE' ? <section className="space-y-2 border-b pb-3" aria-label={t('mediaLibrary')}><h3 className="font-medium">{t('mediaLibrary')}</h3><p className="text-xs text-muted-foreground">{t('mediaDescription')}</p><label className="block space-y-1 text-xs"><span>{t('uploadImage')}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file, file.name, false).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Upload failed')); }} /></label><div className="max-h-40 space-y-1 overflow-auto">{media.map((asset) => <button type="button" key={asset.id} className="block w-full rounded border px-2 py-1 text-left text-xs" onClick={() => selectImageAsset(asset)}>{asset.filename}<span className="block text-muted-foreground">{asset.pixel_width}×{asset.pixel_height}</span></button>)}</div></section> : null}
          <div className="space-y-2 border-b pb-3"><label className="block space-y-1 text-sm"><span>{t('approvedTemplate')}</span><select aria-label={t('approvedTemplate')} className="w-full rounded-md border px-2 py-2" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}><option value="">{t('keepCurrentTemplate')}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.source}</option>)}</select></label><button type="button" className="w-full rounded-md border px-2 py-2 text-sm" disabled={!selectedTemplateId || status === 'saving'} onClick={() => { if (document && selectedTemplateId) void save(document.layout, document.revision, selectedTemplateId); }}>{t('applyTemplate')}</button></div>
          <div className="space-y-3">{panelLabels.map((label, panelIndex) => <section key={label} className={`rounded border p-2 ${selectedPanelIndex === panelIndex ? 'border-primary bg-primary/5' : ''}`}><button type="button" className="mb-2 w-full text-left text-xs font-semibold" onClick={() => setSelectedPanelIndex(panelIndex)}>{label} <span className="font-normal text-muted-foreground">({panelBlocks(panelIndex).length})</span></button><ul className="space-y-1">{panelBlocks(panelIndex).map((block, index) => <li key={block.id} draggable={advancedEditing} onDragStart={(event) => { event.dataTransfer.setData('text/plain', block.id); }}><button type="button" className={`w-full rounded-md border px-2 py-2 text-left text-sm ${selectedBlock?.id === block.id ? 'border-primary bg-primary/10' : ''}`} onClick={() => { setSelectedBlockId(block.id); setSelectedPanelIndex(panelIndex); }}>{blockLabel(block)}<span className="block text-xs text-muted-foreground">{block.visibility}</span></button><div className="mt-1 flex gap-1"><button type="button" className="rounded border px-2 text-xs" aria-label={`Move ${blockLabel(block)} up`} disabled={index === 0} onClick={() => moveSelectedBlock(-1)}>↑</button><button type="button" className="rounded border px-2 text-xs" aria-label={`Move ${blockLabel(block)} down`} disabled={index === panelBlocks(panelIndex).length - 1} onClick={() => moveSelectedBlock(1)}>↓</button></div></li>)}</ul></section>)}</div>
        </aside>
        <section className={`min-h-[620px] overflow-auto rounded-lg border bg-muted/30 p-4 ${modeClass(mode)}`} aria-label={t('documentCanvas')}>
          {mode === 'EDIT' ? <div className="mx-auto space-y-3 rounded-md bg-background p-4 shadow-sm"><div className="text-sm text-muted-foreground">{isBifold ? t('bifoldCanvas') : t('documentCanvas')} · {document.layout.paper} · {document.layout.orientation}</div><div className="grid gap-3 sm:grid-cols-2">{panelLabels.map((label, panelIndex) => <section key={label} aria-label={label} onClick={() => setSelectedPanelIndex(panelIndex)} onDragOver={(event) => { if (advancedEditing) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const blockId = event.dataTransfer.getData('text/plain'); if (blockId) moveBlockToPanel(blockId, panelIndex); }} className={`min-h-52 rounded-md border-2 border-dashed p-3 ${selectedPanelIndex === panelIndex ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}`}><div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">{label}</h2><span className="text-xs text-muted-foreground">{panelBlocks(panelIndex).length} blocks</span></div><div className="space-y-2">{panelBlocks(panelIndex).map((block) => <button type="button" key={block.id} onClick={(event) => { event.stopPropagation(); setSelectedBlockId(block.id); setSelectedPanelIndex(panelIndex); }} className={`block w-full rounded border p-2 text-left text-sm ${selectedBlock?.id === block.id ? 'border-primary bg-primary/10' : ''}`} draggable={advancedEditing} onDragStart={(event) => event.dataTransfer.setData('text/plain', block.id)}><strong>{blockLabel(block)}</strong><span className="ml-2 text-xs text-muted-foreground">{block.visibility}</span></button>)}</div>{advancedEditing ? <p className="mt-3 text-xs text-muted-foreground">Drop blocks here</p> : null}</section>)}</div></div> : previewError ? <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{previewError}</p> : <div className="mx-auto bg-background shadow-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />}
        </section>
        <aside className="space-y-4 rounded-lg border bg-card p-3" aria-label={t('properties')}>
          <section><h2 className="font-semibold">{t('properties')}</h2>{selectedBlock ? <div className="mt-3 space-y-3"><p className="text-sm font-medium">{blockLabel(selectedBlock)}</p><label className="block space-y-1 text-sm"><span>{t('visibility')}</span><select className="w-full rounded-md border px-2 py-2" value={selectedBlock.visibility} onChange={(event) => advancedEditing ? updateAdvancedVisibility(event.target.value as DocumentBlock['visibility']) : updateLayout(setBlockVisibility(document.layout, selectedBlock.id, event.target.value as 'VISIBLE' | 'HIDDEN' | 'HIDE_WHEN_EMPTY'))}><option value="VISIBLE">Visible</option><option value="HIDDEN">Hidden</option><option value="HIDE_WHEN_EMPTY">Hide when empty</option></select></label>{advancedEditing ? <label className="block space-y-1 text-sm"><span>Width</span><select className="w-full rounded-md border px-2 py-2" value={selectedBlock.width} onChange={(event) => { const current = currentAdvanced(); if (current) runLayoutOperation(() => applyAdvanced(resizeBlock(current, selectedBlock.id, event.target.value as 'FULL' | 'TWO_THIRDS' | 'HALF' | 'ONE_THIRD'))); }}><option value="FULL">Full</option><option value="TWO_THIRDS">Two thirds</option><option value="HALF">Half</option><option value="ONE_THIRD">One third</option></select></label> : null}{'text' in selectedBlock.config ? <label className="block space-y-1 text-sm"><span>Text</span><textarea className="min-h-24 w-full rounded-md border p-2" value={String(selectedBlock.config.text)} onChange={(event) => updateSelectedBlock((block) => ({ ...block, config: { ...block.config, text: event.target.value } } as DocumentBlock))} /></label> : null}</div> : <p className="mt-2 text-sm text-muted-foreground">Select a block to edit safe properties.</p>}</section>
          <section><h2 className="font-semibold">{t('theme')}</h2><div className="mt-3 space-y-3"><label className="block space-y-1 text-sm"><span>{t('font')}</span><select className="w-full rounded-md border px-2 py-2" value={document.layout.theme.fontFamily} onChange={(event) => updateTheme({ fontFamily: event.target.value as DocumentLayout['theme']['fontFamily'] })}><option value="SYSTEM_SANS">{t('systemSans')}</option><option value="SERIF">{t('serif')}</option><option value="MONOSPACE">{t('monospace')}</option></select></label><label className="block space-y-1 text-sm"><span>Base font size</span><input className="w-full rounded-md border px-2 py-2" type="number" min={8} max={32} value={document.layout.theme.baseFontSize} onChange={(event) => updateTheme({ baseFontSize: Number(event.target.value) })} /></label></div></section>
          {status === 'conflict' ? <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><p>{message}</p><button type="button" className="rounded border px-2 py-1" onClick={() => void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Reload failed'))}>{t('reloadServer')}</button></div> : null}
          {status === 'error' ? <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => document && void save(document.layout, document.revision)}>{t('retrySave')}</button> : null}
          <p className="text-xs text-muted-foreground">{t('privateDraft')}</p>
        </aside>
      </div>
    </main>
  );
}
