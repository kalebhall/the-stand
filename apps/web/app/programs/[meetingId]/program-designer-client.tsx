'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { renderProgramPreview } from '@/src/document-designer/preview-contract';
import {
  downgradeToV1,
  mergeSimpleIntoAdvanced,
  normalizeToAdvanced,
  type AdvancedDocumentLayout
} from '@/src/document-designer/advanced-schema';
import {
  addBlock,
  configureColumns,
  moveBlockToColumn,
  reorderBlock,
  removeBlock,
  resizeBlock,
  setAdvancedBlockVisibility
} from '@/src/document-designer/layout-operations';
import { commitHistory, createHistory, redo, undo, type HistoryState } from '@/src/document-designer/history';
import type { DocumentBlock, DocumentLayout } from '@/src/document-designer/types';
import type { MediaAssetResponse } from '@/src/document-designer/media-types';
import { getFoldFaceLabelKey } from '@/src/document-designer/print-layout';
import type { PrintValidationResult } from '@/src/document-designer/print-types';
import { ProgramEntriesEditor } from '@/components/program-entries-editor';

import { moveBlock, modeClass, setBlockVisibility, setTheme, type DesignerMode, type SaveState } from './designer-state';

type PreviewSource = {
  meetingDate: string;
  meetingType: string;
  wardName?: string | null;
  location?: string | null;
  publicUrl?: string | null;
  publicValues?: Partial<Record<DocumentBlock['type'], string | null>>;
  programItems: Array<{ order: number; label: string; details?: string | null }>;
  media?: Partial<Record<string, { url: string; altText: string | null; isDecorative: boolean }>>;
};
type LoadedDocument = {
  id: string;
  layout: DocumentLayout;
  advancedLayout?: AdvancedDocumentLayout;
  theme: DocumentLayout['theme'];
  revision: number;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
};

type Props = { wardId: string; meetingId: string };
type ReusableLibraryItem = {
  id: string;
  name: string;
  description: string | null;
  current_version: number;
  snapshot_json: {
    blockType: DocumentBlock['type'];
    config: DocumentBlock['config'];
    width: DocumentBlock['width'];
    visibility: DocumentBlock['visibility'];
    printBehavior: DocumentBlock['printBehavior'];
    digitalBehavior: DocumentBlock['digitalBehavior'];
    source?: DocumentBlock['source'];
  };
};

type BlockCategory = 'ALL' | 'CORE' | 'REUSABLE' | 'MEDIA' | 'LINKS';
const blockCategory = (block: DocumentBlock): Exclude<BlockCategory, 'ALL'> => {
  if (block.type === 'IMAGE') return 'MEDIA';
  if (block.type === 'QR_CODE' || block.type === 'CUSTOM_LINK') return 'LINKS';
  if (block.type === 'CUSTOM_TEXT' || block.type === 'DIVIDER' || block.type === 'SPACER') return 'REUSABLE';
  return 'CORE';
};
const blockIcon = (category: Exclude<BlockCategory, 'ALL'>) => ({ CORE: '▦', REUSABLE: '✦', MEDIA: '▧', LINKS: '⌁' })[category];
const blockDescriptionKey = (category: Exclude<BlockCategory, 'ALL'>) =>
  ({
    CORE: 'coreSectionsDescription',
    REUSABLE: 'reusableBlocksDescription',
    MEDIA: 'mediaBlocksDescription',
    LINKS: 'linksAndQrDescription'
  })[category];
const REUSABLE_BLOCK_TYPES = new Set(['CUSTOM_TEXT', 'IMAGE', 'DIVIDER', 'SPACER', 'QR_CODE', 'CUSTOM_LINK']);
const safeDigitalUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && value.length <= 2048;
  } catch {
    return false;
  }
};

type TemplateOption = {
  id: string;
  name: string;
  source: string;
  scopeType?: string;
  status?: string;
  distributionPolicy?: string | null;
  version?: { version?: number; lock?: unknown } | null;
};

export function ProgramDesignerClient({ wardId, meetingId }: Props) {
  const t = useTranslations('programs');
  const blockTypeLabel = useCallback((type: DocumentBlock['type']) => t(`blockType.${type}` as never), [t]);
  const blockLabel = useCallback((block: DocumentBlock) => blockTypeLabel(block.type), [blockTypeLabel]);
  const meetingTypeLabel = useCallback((type: string) => t(`meetingType.${type}` as never), [t]);
  const visibilityLabel = useCallback((visibility: DocumentBlock['visibility']) => t(`visibilityOption.${visibility}` as never), [t]);
  const widthLabel = useCallback((width: DocumentBlock['width']) => t(`widthOption.${width}` as never), [t]);
  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [media, setMedia] = useState<MediaAssetResponse[]>([]);
  const [reusableBlocks, setReusableBlocks] = useState<ReusableLibraryItem[]>([]);
  const [reusableName, setReusableName] = useState('');
  const [reusableDescription, setReusableDescription] = useState('');
  const [reusableScope, setReusableScope] = useState<'PERSONAL' | 'WARD' | 'STAKE'>('PERSONAL');

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [mode, setMode] = useState<DesignerMode>('EDIT');
  const [publicVisitor, setPublicVisitor] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blockCategoryFilter, setBlockCategoryFilter] = useState<BlockCategory>('ALL');
  const [selectedPanelIndex, setSelectedPanelIndex] = useState(0);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [advancedEnabled, setAdvancedEnabled] = useState(false);
  const [advancedEditing, setAdvancedEditing] = useState(false);
  const [printValidation, setPrintValidation] = useState<PrintValidationResult | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState | null>(null);
  const [status, setStatus] = useState<SaveState>('loading');
  const [message, setMessage] = useState(t('loadingDesign'));
  const [loaded, setLoaded] = useState(false);
  const initialLayout = useRef<DocumentLayout | null>(null);
  const initialAdvancedLayout = useRef<AdvancedDocumentLayout | null>(null);
  const latestLayout = useRef<DocumentLayout | null>(null);
  const latestAdvancedLayout = useRef<AdvancedDocumentLayout | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRefreshGeneration = useRef(0);

  latestLayout.current = document?.layout ?? null;
  latestAdvancedLayout.current = document?.advancedLayout ?? null;

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
    initialAdvancedLayout.current = body.document.advancedLayout ?? null;
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
        setSource((current) =>
          current
            ? {
                ...current,
                media: Object.fromEntries(
                  loadedMedia
                    .filter((asset: MediaAssetResponse) => asset.url)
                    .map((asset: MediaAssetResponse) => [
                      asset.id,
                      {
                        url: `/api/w/${encodeURIComponent(wardId)}/media/${encodeURIComponent(asset.id)}`,
                        altText: asset.alt_text,
                        isDecorative: asset.is_decorative
                      }
                    ])
                )
              }
            : current
        );
      }
    } catch {
      setMedia([]);
    }
    try {
      const reusableResponse = await fetch(`/api/w/${wardId}/reusable-blocks`);
      const reusableBody = await reusableResponse.json();
      if (reusableResponse.ok) setReusableBlocks(reusableBody.blocks ?? []);
    } catch {
      setReusableBlocks([]);
    }
    setLoaded(true);
    setStatus('saved');
    setMessage(t('saved'));
  }, [meetingId, t, wardId]);

  const refreshPreviewSource = useCallback(async () => {
    const generation = ++previewRefreshGeneration.current;
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/program-design`, { cache: 'no-store' });
    const body = await response.json();
    if (generation === previewRefreshGeneration.current && response.ok && body.previewSource)
      setSource((current) => ({
        ...body.previewSource,
        media: body.previewSource.media ?? current?.media,
        ...(Object.prototype.hasOwnProperty.call(body.previewSource, 'publicUrl') ? {} : { publicUrl: current?.publicUrl })
      }));
  }, [meetingId, wardId]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : t('failedLoadDesign'));
    });
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [load, t]);

  const allBlocks = useMemo(
    () => document?.layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)) ?? [],
    [document]
  );
  const advancedPages = document?.advancedLayout?.pages ?? [];
  const panelBlocks = (panelIndex: number) => currentAdvanced()?.pages[selectedPageIndex]?.regions[panelIndex]?.blocks ?? [];
  const filteredPanelBlocks = (panelIndex: number) =>
    panelBlocks(panelIndex).filter((block) => blockCategoryFilter === 'ALL' || blockCategory(block) === blockCategoryFilter);
  const blockLocation = (blockId: string) => {
    const current = currentAdvanced();
    if (!current) return null;
    for (const [pageIndex, page] of current.pages.entries()) {
      const regionIndex = page.regions.findIndex((region) => region.blocks.some((block) => block.id === blockId));
      if (regionIndex >= 0) return { pageIndex, regionIndex };
    }
    return null;
  };
  const panelForBlock = (blockId: string) => blockLocation(blockId)?.regionIndex ?? -1;
  const selectedBlock = allBlocks.find((block) => block.id === selectedBlockId) ?? allBlocks[0];
  const selectedReusable = selectedBlock?.reusableBlockId
    ? reusableBlocks.find((item) => item.id === selectedBlock.reusableBlockId)
    : undefined;
  const isBifold = document?.layout.fold === 'BIFOLD';
  const panelLabels = currentAdvanced()?.pages[selectedPageIndex]?.regions.map((region, index) => {
    const key = getFoldFaceLabelKey(region.face);
    return key ? t(key) : t('regionNumber', { number: index + 1 });
  }) ?? [];
  const programRows = useMemo(() => {
    const leadership = source?.publicValues?.PRESIDING_CONDUCTING;
    let roles: { presiding?: string; conducting?: string } = {};
    if (leadership) {
      try {
        roles = JSON.parse(leadership) as typeof roles;
      } catch {
        roles = {};
      }
    }
    return [
      { label: t('presiding'), value: roles.presiding ?? '' },
      { label: t('conducting'), value: roles.conducting ?? '' },
      ...[...(source?.programItems ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((item) => ({ label: item.label, value: item.details ?? '' }))
    ];
  }, [source, t]);

  const save = useCallback(
    async (
      nextLayout: DocumentLayout | AdvancedDocumentLayout,
      expectedRevision: number,
      templateId?: string,
      saveMode: 'SIMPLE' | 'ADVANCED' = 'SIMPLE'
    ) => {
      setStatus('saving');
      setMessage(t('saving'));
      const requestedLayoutSnapshot = JSON.stringify(nextLayout);
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
          return false;
        }
        if (!response.ok) throw new Error(body.error ?? t('saveFailed'));
        const savedLayout =
          body.document?.layout ?? (body.document?.schemaVersion === 2 ? downgradeToV1(body.document) : body.document) ?? nextLayout;
        const savedAdvancedLayout = body.document?.schemaVersion === 2 ? (body.document as AdvancedDocumentLayout) : null;
        initialLayout.current = savedLayout;
        if (savedAdvancedLayout) initialAdvancedLayout.current = savedAdvancedLayout;
        const hasNewerSimpleDraft =
          latestLayout.current !== null && saveMode === 'SIMPLE' && JSON.stringify(latestLayout.current) !== requestedLayoutSnapshot;
        const hasNewerAdvancedDraft =
          latestAdvancedLayout.current !== null &&
          saveMode === 'ADVANCED' &&
          JSON.stringify(latestAdvancedLayout.current) !== requestedLayoutSnapshot;
        setDocument((current) => {
          if (!current) return current;
          if (hasNewerSimpleDraft || hasNewerAdvancedDraft) return { ...current, revision: body.revision };
          return {
            ...current,
            layout: savedLayout,
            advancedLayout: savedAdvancedLayout ?? current.advancedLayout,
            theme: savedLayout.theme,
            revision: body.revision
          };
        });
        if (hasNewerAdvancedDraft && latestAdvancedLayout.current) {
          void save(latestAdvancedLayout.current, body.revision, undefined, 'ADVANCED');
          return false;
        }
        setStatus('saved');
        setMessage(t('saved'));
        return true;
      } catch (error: unknown) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : t('retryConnected'));
        return false;
      }
    },
    [meetingId, wardId]
  );

  async function changeMode(nextMode: DesignerMode) {
    if (nextMode === mode) return;
    if (!advancedEditing) {
      setMode(nextMode);
      return;
    }
    if (!document || status === 'saving') return;
    const current = currentAdvanced();
    if (!current) return;
    const isDirty = JSON.stringify(initialAdvancedLayout.current) !== JSON.stringify(current);
    if (nextMode !== 'CONTENT') {
      setAdvancedEditing(false);
      setMode(nextMode);
      if (isDirty) void save(current, document.revision, undefined, 'ADVANCED');
      return;
    }
    if (isDirty) {
      const saved = await save(current, document.revision, undefined, 'ADVANCED');
      if (!saved) return;
    }
    setAdvancedEditing(false);
    setMode(nextMode);
  }

  async function toggleAdvancedEditing() {
    if (!advancedEditing) {
      if (document) {
        const merged = document.advancedLayout
          ? mergeSimpleIntoAdvanced(document.advancedLayout, document.layout)
          : normalizeToAdvanced(document.layout);
        setDocument((current) => (current ? { ...current, advancedLayout: merged } : current));
        setHistoryState(createHistory(merged));
      }
      setAdvancedEditing(true);
      return;
    }
    if (!document || status === 'saving') return;
    const current = currentAdvanced();
    if (!current) {
      setAdvancedEditing(false);
      return;
    }
    if (JSON.stringify(initialAdvancedLayout.current) !== JSON.stringify(current)) {
      const saved = await save(current, document.revision, undefined, 'ADVANCED');
      if (!saved) return;
    }
    setAdvancedEditing(false);
  }

  useEffect(() => {
    if (!loaded || advancedEditing || !document || !initialLayout.current) return;
    if (JSON.stringify(initialLayout.current) === JSON.stringify(document.layout)) return;
    if (status === 'conflict' || status === 'saving') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void save(document.layout, document.revision);
    }, 650);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [advancedEditing, document, loaded, save, status]);

  function updateLayout(nextLayout: DocumentLayout) {
    setDocument((current) => (current ? { ...current, layout: nextLayout, theme: nextLayout.theme } : current));
    if (status === 'conflict') setStatus('idle');
  }

  function updateSelectedBlock(mutator: (block: DocumentBlock) => DocumentBlock) {
    if (!document || !selectedBlock) return;
    if (advancedEditing) {
      const current = currentAdvanced();
      if (!current) return;
      const next = structuredClone(current);
      for (const page of next.pages)
        for (const region of page.regions) {
          const index = region.blocks.findIndex((block) => block.id === selectedBlock.id);
          if (index >= 0) {
            region.blocks[index] = { ...region.blocks[index], ...mutator(region.blocks[index]) };
            runLayoutOperation(() => applyAdvanced(next));
            return;
          }
        }
      return;
    }
    const next = structuredClone(document.layout);
    for (const page of next.pages)
      for (const region of page.regions) {
        const index = region.blocks.findIndex((block) => block.id === selectedBlock.id);
        if (index >= 0) {
          region.blocks[index] = mutator(region.blocks[index]);
          updateLayout(next);
          return;
        }
      }
  }

  function updateAdvancedVisibility(value: DocumentBlock['visibility']) {
    const current = currentAdvanced();
    if (current && selectedBlockId) runLayoutOperation(() => applyAdvanced(setAdvancedBlockVisibility(current, selectedBlockId, value)));
  }

  function moveSelectedBlock(delta: -1 | 1, blockId: string | null = selectedBlockId) {
    if (advancedEditing) {
      const current = currentAdvanced();
      if (current && blockId) runLayoutOperation(() => applyAdvanced(reorderBlock(current, blockId, delta)));
      return;
    }
    if (document && blockId) updateLayout(moveBlock(document.layout, blockId, delta));
  }

  function updateTheme(theme: Partial<DocumentLayout['theme']>) {
    if (advancedEditing) {
      const current = currentAdvanced();
      if (current) runLayoutOperation(() => applyAdvanced({ ...current, theme: { ...current.theme, ...theme } }));
      return;
    }
    if (document) updateLayout(setTheme(document.layout, theme));
  }

  function applyAdvanced(next: AdvancedDocumentLayout) {
    setHistoryState((current) => (current ? commitHistory(current, next) : createHistory(next)));
    setDocument((current) => (current ? { ...current, advancedLayout: next, layout: downgradeToV1(next), theme: next.theme } : current));
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

  function moveBlockToPanel(blockId: string, targetPage: number, targetPanel: number) {
    const location = blockLocation(blockId);
    if (!document || !advancedEditing || (location?.pageIndex === targetPage && location.regionIndex === targetPanel)) return;
    runLayoutOperation(() => {
      const current = currentAdvanced();
      if (current) applyAdvanced(moveBlockToColumn(current, blockId, targetPage, targetPanel, 0));
    });
  }

  function currentAdvanced(): AdvancedDocumentLayout | null {
    return document?.advancedLayout ?? (document ? normalizeToAdvanced(document.layout) : null);
  }

  function undoAdvanced() {
    if (!historyState) return;
    const next = undo(historyState);
    setHistoryState(next);
    setDocument((current) =>
      current ? { ...current, advancedLayout: next.present, layout: downgradeToV1(next.present), theme: next.present.theme } : current
    );
  }

  function redoAdvanced() {
    if (!historyState) return;
    const next = redo(historyState);
    setHistoryState(next);
    setDocument((current) =>
      current ? { ...current, advancedLayout: next.present, layout: downgradeToV1(next.present), theme: next.present.theme } : current
    );
  }

  function addAdvancedTextBlock() {
    addAdvancedBlock('CUSTOM_TEXT');
  }

  function addAdvancedBlock(type: 'CUSTOM_TEXT' | 'PRESIDING_CONDUCTING') {
    const current = currentAdvanced();
    if (!current) return;
    const block: DocumentBlock = {
      id: crypto.randomUUID() as DocumentBlock['id'],
      type,
      width: 'FULL',
      dataMode: type === 'PRESIDING_CONDUCTING' ? 'AUTO' : 'MANUAL',
      visibility: 'VISIBLE',
      printBehavior: 'PRINT_AND_DIGITAL',
      digitalBehavior: 'NORMAL',
      config: { text: type === 'PRESIDING_CONDUCTING' ? '' : t('newTextBlock') }
    } as DocumentBlock;
    setAdvancedEditing(true);
    runLayoutOperation(() => applyAdvanced(addBlock(current, selectedPageIndex, selectedPanelIndex, block)));
  }

  function insertReusableBlock(item: ReusableLibraryItem) {
    const snapshot = item.snapshot_json;
    const block = {
      id: crypto.randomUUID() as DocumentBlock['id'],
      type: snapshot.blockType,
      width: snapshot.width,
      dataMode: snapshot.visibility === 'HIDE_WHEN_EMPTY' ? ('AUTO' as const) : ('MANUAL' as const),
      visibility: snapshot.visibility,
      printBehavior: snapshot.printBehavior,
      digitalBehavior: snapshot.digitalBehavior,
      config: snapshot.config,
      source: snapshot.source,
      reusableBlockId: item.id,
      reusableBlockVersion: item.current_version
    } as DocumentBlock;
    const current = currentAdvanced();
    if (!current) return;
    if (!advancedEditing) setAdvancedEditing(true);
    runLayoutOperation(() => applyAdvanced(addBlock(current, selectedPageIndex, selectedPanelIndex, block)));
  }

  function updateSelectedFromReusableVersion(item: ReusableLibraryItem) {
    if (!selectedBlock) return;
    const snapshot = item.snapshot_json;
    const current = currentAdvanced();
    if (!current) return;
    const advancedBlock =
      current.pages
        .flatMap((page) => page.regions)
        .flatMap((region) => region.blocks)
        .find((block) => block.id === selectedBlock.id) ?? selectedBlock;
    const replacement = {
      ...advancedBlock,
      type: snapshot.blockType,
      width: snapshot.width,
      dataMode: snapshot.visibility === 'HIDE_WHEN_EMPTY' ? ('AUTO' as const) : ('MANUAL' as const),
      visibility: snapshot.visibility,
      printBehavior: snapshot.printBehavior,
      digitalBehavior: snapshot.digitalBehavior,
      config: snapshot.config,
      source: snapshot.source,
      reusableBlockId: item.id,
      reusableBlockVersion: item.current_version
    } as DocumentBlock;
    const next = structuredClone(current);
    for (const page of next.pages)
      for (const region of page.regions) {
        const index = region.blocks.findIndex((block) => block.id === selectedBlock.id);
        if (index >= 0) region.blocks[index] = replacement;
      }
    if (!advancedEditing) setAdvancedEditing(true);
    runLayoutOperation(() => applyAdvanced(next));
    if (document) void save(next, document.revision, undefined, 'ADVANCED');
  }

  async function saveSelectedAsReusableBlock() {
    if (!selectedBlock || !reusableName.trim()) return;
    setStatus('saving');
    let persisted = false;
    try {
      const response = await fetch(`/api/w/${wardId}/reusable-blocks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scope: reusableScope,
          name: reusableName.trim(),
          description: reusableDescription.trim() || null,
          snapshot: {
            version: 1,
            blockType: selectedBlock.type,
            config: selectedBlock.config,
            width: selectedBlock.width,
            visibility: selectedBlock.visibility,
            printBehavior: selectedBlock.printBehavior,
            digitalBehavior: selectedBlock.digitalBehavior,
            source: selectedBlock.source
          }
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t('unableSaveReusableBlock'));
      persisted = true;
      const libraryResponse = await fetch(`/api/w/${wardId}/reusable-blocks`);
      const libraryBody = await libraryResponse.json();
      if (!libraryResponse.ok) throw new Error(libraryBody.error ?? t('libraryRefreshFailed'));
      setReusableBlocks(libraryBody.blocks ?? []);
      setReusableName('');
      setReusableDescription('');
      setStatus('saved');
      setMessage(t('reusableBlockSaved'));
    } catch (error: unknown) {
      setStatus(persisted ? 'saved' : 'error');
      setMessage(
        error instanceof Error ? (persisted ? `${error.message}. ${t('reloadFailed')}.` : error.message) : t('unableSaveReusableBlock')
      );
    }
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
    setSource((current) =>
      current
        ? {
            ...current,
            media: {
              ...current.media,
              ...(asset.url ? { [asset.id]: { url: asset.url, altText: asset.alt_text, isDecorative: asset.is_decorative } } : {})
            }
          }
        : current
    );
    return asset;
  }

  function selectImageAsset(asset: MediaAssetResponse) {
    if (selectedBlock?.type !== 'IMAGE' || !asset.url) return;
    updateSelectedBlock(
      (block) =>
        ({ ...block, config: { assetId: asset.id, alt: asset.alt_text ?? '', isDecorative: asset.is_decorative } }) as DocumentBlock
    );
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
    const body = (await response.json()) as PrintValidationResult & { error?: string };
    if (!response.ok) throw new Error(body.error ?? t('printValidationFailed'));
    setPrintValidation(body);
  }

  function downloadPdf(sourceName: 'draft' | 'published') {
    window.open(
      `/api/w/${encodeURIComponent(wardId)}/meetings/${encodeURIComponent(meetingId)}/program-design/pdf?source=${sourceName}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  let previewHtml = '';
  let previewError = '';
  if (document && source && mode !== 'EDIT' && mode !== 'CONTENT') {
    try {
      previewHtml = renderProgramPreview(document.advancedLayout ?? document.layout, source, {
        target: mode === 'PRINT' ? 'PRINT' : 'DIGITAL',
        publicVisitor
      })
        .html.replace(/<main[^>]*>/, '')
        .replace(/<\/main>/, '');
    } catch (error: unknown) {
      previewError = error instanceof Error ? error.message : t('previewUnavailable');
    }
  }

  if (!document)
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p role="status">{message}</p>
      </main>
    );

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">{t('designerSimple')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('meetingProgram')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {source?.meetingDate} · {source ? meetingTypeLabel(source.meetingType) : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/programs/templates"
            className="rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
          >
            {t('templates')}
          </Link>
          <span role="status" aria-live="polite" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {message}
          </span>
        </div>
      </header>
      <nav
        aria-label={t('designerModes')}
        className="sticky top-14 z-10 flex flex-wrap gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        {(['CONTENT', 'EDIT', 'DIGITAL', 'PHONE', 'PRINT'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === value ? 'bg-primary text-primary-foreground shadow-sm' : 'border bg-card hover:bg-muted'}`}
            onClick={() => void changeMode(value)}
          >
            {value === 'CONTENT'
              ? t('content')
              : value === 'EDIT'
                ? t('edit')
                : value === 'DIGITAL'
                  ? t('desktopPreview')
                  : value === 'PHONE'
                    ? t('phonePreview')
                    : t('printPreview')}
          </button>
        ))}
        {advancedEnabled ? (
          <button
            type="button"
            aria-pressed={advancedEditing}
            className={`rounded-md px-3 py-2 text-sm ${advancedEditing ? 'bg-primary text-primary-foreground' : 'border'}`}
            onClick={() => void toggleAdvancedEditing()}
            disabled={status === 'saving'}
          >
            {advancedEditing ? t('simpleMode') : t('advancedMode')}
          </button>
        ) : null}
        {mode !== 'EDIT' && mode !== 'CONTENT' ? (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={publicVisitor} onChange={(event) => setPublicVisitor(event.target.checked)} />{' '}
            {t('previewPublic')}
          </label>
        ) : null}
      </nav>
      <section aria-label={t('templateMetadata')} className="rounded-md border bg-card p-3 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span>
            <span className="font-medium">{t('sourceScope')}</span>{' '}
            {templates.find((template) => template.id === document.sourceTemplateId)?.scopeType ??
              (document.sourceTemplateId ? t('unavailable') : t('systemBuiltIn'))}
          </span>
          <span>
            <span className="font-medium">{t('publicationVersion')}</span>{' '}
            {document.sourceTemplateVersion ? `v${document.sourceTemplateVersion}` : t('draftLayout')}
          </span>
          <span>
            <span className="font-medium">{t('lock')}</span>{' '}
            {document.sourceTemplateId && templates.find((template) => template.id === document.sourceTemplateId)?.version?.lock
              ? t('lockedSourceBlocks')
              : t('noSourceLock')}
          </span>
          <span>
            <span className="font-medium">{t('templatePolicy')}</span> {t('templatePolicyCopy')}
          </span>
        </div>
      </section>
      {mode === 'PRINT' ? (
        <section aria-label={t('printActions')} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() =>
              void validatePrint().catch((error: unknown) =>
                setMessage(error instanceof Error ? error.message : t('printValidationFailed'))
              )
            }
          >
            {t('validatePrint')}
          </button>
          <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => downloadPdf('draft')}>
            {t('downloadDraftPdf')}
          </button>
          <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => downloadPdf('published')}>
            {t('downloadPublishedPdf')}
          </button>
          {printValidation ? (
            <span className={`text-sm ${printValidation.valid ? 'text-green-700' : 'text-red-700'}`}>
              {printValidation.valid
                ? t('printReady', { count: printValidation.pageCount })
                : t('printErrors', { count: printValidation.errors.length })}
            </span>
          ) : null}
        </section>
      ) : null}
      {mode === 'PRINT' && printValidation && !printValidation.valid ? (
        <section aria-label={t('printDiagnostics')} className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          <h2 className="font-semibold">{t('printDiagnostics')}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {[...printValidation.errors, ...printValidation.warnings].map((issue, index) => (
              <li key={`${issue.code}-${issue.blockId ?? 'document'}-${index}`}>
                {issue.message}
                {issue.suggestion ? ` ${issue.suggestion}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {mode === 'CONTENT' ? (
        <ProgramEntriesEditor wardId={wardId} meetingId={meetingId} onSaved={() => void refreshPreviewSource()} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
          <aside className="space-y-3 rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:top-16" aria-label={t('approvedBlocks')}>
            <div>
              <h2 className="font-semibold">{t('blocks')}</h2>
              <p className="text-xs text-muted-foreground">{t('simpleBlocksDescription')}</p>
            </div>
            {advancedEditing ? (
              <section className="space-y-2 border-b pb-3" aria-label={t('advancedControls')}>
                <h3 className="font-medium">{t('spatialLayout')}</h3>
                <p className="text-xs text-muted-foreground">{t('spatialDescription')}</p>
                <label className="block space-y-1 text-xs">
                  <span>{t('page')}</span>
                  <select
                    className="w-full rounded border px-2 py-2"
                    value={selectedPageIndex}
                    onChange={(event) => {
                      setSelectedPageIndex(Number(event.target.value));
                      setSelectedPanelIndex(0);
                    }}
                  >
                    {advancedPages.map((_, pageIndex) => (
                      <option key={pageIndex} value={pageIndex}>
                        {t('pageNumber', { number: pageIndex + 1 })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs">
                  <span>{t('targetPanel')}</span>
                  <select
                    className="w-full rounded border px-2 py-2"
                    value={selectedPanelIndex}
                    onChange={(event) => setSelectedPanelIndex(Number(event.target.value))}
                  >
                    {panelLabels.map((label, index) => (
                      <option key={label} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs">
                  <span>{t('moveSelectedBlock')}</span>
                  <select
                    className="w-full rounded border px-2 py-2"
                    value={
                      selectedBlockId && blockLocation(selectedBlockId)?.pageIndex === selectedPageIndex
                        ? Math.max(panelForBlock(selectedBlockId), 0)
                        : selectedPanelIndex
                    }
                    disabled={!selectedBlockId}
                    onChange={(event) => moveBlockToPanel(selectedBlockId ?? '', selectedPageIndex, Number(event.target.value))}
                  >
                    {panelLabels.map((label, index) => (
                      <option key={label} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" className="rounded border px-2 py-2 text-xs" onClick={addAdvancedTextBlock}>
                    {t('addToPanel')}
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-2 text-xs"
                    disabled={!selectedBlockId}
                    onClick={removeSelectedAdvancedBlock}
                  >
                    {t('removeSelected')}
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-2 text-xs"
                    disabled={!historyState?.past.length}
                    onClick={undoAdvanced}
                  >
                    {t('undo')}
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-2 text-xs"
                    disabled={!historyState?.future.length}
                    onClick={redoAdvanced}
                  >
                    {t('redo')}
                  </button>
                  <button
                    type="button"
                    className="col-span-2 rounded border px-2 py-2 text-xs"
                    onClick={saveAdvanced}
                    disabled={status === 'saving'}
                  >
                    {t('saveAdvancedLayout')}
                  </button>
                </div>
                <label className="block space-y-1 text-xs">
                  <span>{t('columnsInPanel')}</span>
                  <select
                    className="w-full rounded border px-2 py-2"
                    value={currentAdvanced()?.pages[selectedPageIndex]?.regions[selectedPanelIndex]?.columns.count ?? 1}
                    onChange={(event) => {
                      const current = currentAdvanced();
                      if (current)
                        runLayoutOperation(() =>
                          applyAdvanced(
                            configureColumns(
                              current,
                              selectedPageIndex,
                              selectedPanelIndex,
                              Number(event.target.value) as 1 | 2 | 3,
                              Number(event.target.value) === 1 ? '1/1' : Number(event.target.value) === 2 ? '1/3+2/3' : '1/1',
                              8
                            )
                          )
                        );
                    }}
                  >
                    <option value="1">{t('columnCount', { count: 1 })}</option>
                    <option value="2">{t('columnCount', { count: 2 })}</option>
                    <option value="3">{t('columnCount', { count: 3 })}</option>
                  </select>
                </label>
              </section>
            ) : null}
            {operationError ? (
              <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
                {operationError}
              </p>
            ) : null}
            <section className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3" aria-label={t('programEntries')}>
              <h3 className="font-medium">{t('programEntries')}</h3>
              <p className="text-xs text-muted-foreground">{t('programEntriesDescription')}</p>
              <dl className="space-y-1 text-xs">
                {programRows.map((row, index) => (
                  <div
                    key={`${row.label}-${index}`}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 rounded border bg-background px-2 py-1.5"
                  >
                    <dt className="font-medium">{row.label}</dt>
                    <dd className="truncate text-muted-foreground">{row.value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {advancedEnabled ? (
              <section className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3" aria-label={t('addProgramBlock')}>
                <h3 className="font-medium">{t('addProgramBlock')}</h3>
                <p className="text-xs text-muted-foreground">{t('addProgramBlockDescription')}</p>
                <div className="grid gap-2">
                  <button
                    type="button"
                    className="rounded border bg-background px-2 py-2 text-left text-sm"
                    onClick={() => addAdvancedBlock('PRESIDING_CONDUCTING')}
                  >
                    {t('addPresidingConducting')}
                  </button>
                  <button
                    type="button"
                    className="rounded border bg-background px-2 py-2 text-left text-sm"
                    onClick={() => addAdvancedBlock('CUSTOM_TEXT')}
                  >
                    {t('addCustomBlock')}
                  </button>
                </div>
              </section>
            ) : null}
            {reusableBlocks.length > 0 ? (
              <section className="space-y-2 border-b pb-3" aria-label={t('reusableBlocks')}>
                <h3 className="font-medium">{t('reusableBlocks')}</h3>
                <p className="text-xs text-muted-foreground">{t('reusableBlocksDescription')}</p>
                <div className="max-h-48 space-y-1 overflow-auto">
                  {reusableBlocks.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="block w-full rounded border px-2 py-2 text-left text-xs hover:border-primary"
                      onClick={() => insertReusableBlock(item)}
                    >
                      <span className="block font-medium">{item.name}</span>
                      <span className="text-muted-foreground">
                        v{item.current_version} · {blockTypeLabel(item.snapshot_json.blockType)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {selectedBlock?.type === 'IMAGE' ? (
              <section className="space-y-2 border-b pb-3" aria-label={t('mediaLibrary')}>
                <h3 className="font-medium">{t('mediaLibrary')}</h3>
                <p className="text-xs text-muted-foreground">{t('mediaDescription')}</p>
                <label className="block space-y-1 text-xs">
                  <span>{t('uploadImage')}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file)
                        void uploadMedia(file, file.name, false).catch((error: unknown) =>
                          setMessage(error instanceof Error ? error.message : t('uploadFailed'))
                        );
                    }}
                  />
                </label>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {media.map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      className="block w-full rounded border px-2 py-1 text-left text-xs"
                      onClick={() => selectImageAsset(asset)}
                    >
                      {asset.filename}
                      <span className="block text-muted-foreground">
                        {asset.pixel_width}×{asset.pixel_height}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="space-y-2 border-b pb-3">
              <label className="block space-y-1 text-sm">
                <span>{t('approvedTemplate')}</span>
                <select
                  aria-label={t('approvedTemplate')}
                  className="w-full rounded-md border px-2 py-2"
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                >
                  <option value="">{t('keepCurrentTemplate')}</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.source}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="w-full rounded-md border px-2 py-2 text-sm"
                disabled={!selectedTemplateId || status === 'saving'}
                onClick={() => {
                  if (document && selectedTemplateId) void save(document.layout, document.revision, selectedTemplateId);
                }}
              >
                {t('applyTemplate')}
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="group" aria-label={t('blocks')}>
                <button
                  type="button"
                  aria-pressed={blockCategoryFilter === 'ALL'}
                  className={`rounded px-2 py-1.5 text-xs ${blockCategoryFilter === 'ALL' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setBlockCategoryFilter('ALL')}
                >
                  {t('blocks')}
                </button>
                <button
                  type="button"
                  aria-pressed={blockCategoryFilter === 'CORE'}
                  className={`rounded px-2 py-1.5 text-xs ${blockCategoryFilter === 'CORE' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setBlockCategoryFilter('CORE')}
                >
                  {t('coreSections')}
                </button>
                <button
                  type="button"
                  aria-pressed={blockCategoryFilter === 'REUSABLE'}
                  className={`rounded px-2 py-1.5 text-xs ${blockCategoryFilter === 'REUSABLE' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setBlockCategoryFilter('REUSABLE')}
                >
                  {t('reusableBlocks')}
                </button>
                <button
                  type="button"
                  aria-pressed={blockCategoryFilter === 'MEDIA'}
                  className={`rounded px-2 py-1.5 text-xs ${blockCategoryFilter === 'MEDIA' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setBlockCategoryFilter('MEDIA')}
                >
                  {t('mediaBlocks')}
                </button>
                <button
                  type="button"
                  aria-pressed={blockCategoryFilter === 'LINKS'}
                  className={`col-span-2 rounded px-2 py-1.5 text-xs ${blockCategoryFilter === 'LINKS' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => setBlockCategoryFilter('LINKS')}
                >
                  {t('linksAndQr')}
                </button>
              </div>
              {panelLabels.map((label, panelIndex) => (
                <section
                  key={label}
                  className={`rounded border p-2 ${selectedPanelIndex === panelIndex ? 'border-primary bg-primary/5' : ''}`}
                >
                  <button
                    type="button"
                    className="mb-2 w-full text-left text-xs font-semibold"
                    onClick={() => setSelectedPanelIndex(panelIndex)}
                  >
                    {label} <span className="font-normal text-muted-foreground">({panelBlocks(panelIndex).length})</span>
                  </button>
                  {filteredPanelBlocks(panelIndex).length === 0 ? (
                    <p className="rounded px-2 py-3 text-xs text-muted-foreground">{t('emptyCategory')}</p>
                  ) : null}
                  <ul className="space-y-1">
                    {filteredPanelBlocks(panelIndex).map((block) => (
                      <li
                        key={block.id}
                        draggable={advancedEditing}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', block.id);
                        }}
                      >
                        <button
                          type="button"
                          className={`w-full rounded-md border px-2 py-2 text-left text-sm ${selectedBlock?.id === block.id ? 'border-primary bg-primary/10' : ''}`}
                          onClick={() => {
                            setSelectedBlockId(block.id);
                            setSelectedPanelIndex(panelIndex);
                          }}
                        >
                          <span aria-hidden="true" className="mr-2 text-primary">
                            {blockIcon(blockCategory(block))}
                          </span>
                          <span>
                            {blockLabel(block)}
                            <span className="block text-xs text-muted-foreground">{t(blockDescriptionKey(blockCategory(block)))}</span>
                            <span className="block text-xs text-muted-foreground">{visibilityLabel(block.visibility)}</span>
                          </span>
                        </button>
                        <div className="mt-1 flex gap-1">
                          <button
                            type="button"
                            className="rounded border px-2 text-xs"
                            aria-label={t('moveBlockUp', { block: blockLabel(block) })}
                            disabled={panelBlocks(panelIndex).findIndex((candidate) => candidate.id === block.id) === 0}
                            onClick={() => moveSelectedBlock(-1, block.id)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 text-xs"
                            aria-label={t('moveBlockDown', { block: blockLabel(block) })}
                            disabled={
                              panelBlocks(panelIndex).findIndex((candidate) => candidate.id === block.id) ===
                              panelBlocks(panelIndex).length - 1
                            }
                            onClick={() => moveSelectedBlock(1, block.id)}
                          >
                            ↓
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </aside>
          <section
            className={`min-h-[680px] overflow-auto rounded-xl border bg-muted/50 p-3 shadow-inner sm:p-5 ${modeClass(mode)}`}
            aria-label={t('documentCanvas')}
          >
            {mode === 'EDIT' ? (
              <div className="mx-auto max-w-[820px] space-y-3 rounded-lg border bg-background p-4 shadow-md sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {isBifold ? t('bifoldCanvas') : t('documentCanvas')} · {document.layout.paper} · {document.layout.orientation}
                  </span>
                  <span>{t('blocksCount', { count: allBlocks.length })}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {panelLabels.map((label, panelIndex) => (
                    <section
                      key={label}
                      aria-label={label}
                      onClick={() => setSelectedPanelIndex(panelIndex)}
                      onDragOver={(event) => {
                        if (advancedEditing) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const blockId = event.dataTransfer.getData('text/plain');
                        if (blockId) moveBlockToPanel(blockId, selectedPageIndex, panelIndex);
                      }}
                      className={`min-h-52 rounded-md border-2 border-dashed p-3 transition-colors ${selectedPanelIndex === panelIndex ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 bg-muted/20'}`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="font-semibold">{label}</h2>
                        <span className="text-xs text-muted-foreground">{t('blocksCount', { count: panelBlocks(panelIndex).length })}</span>
                      </div>
                      <div className="space-y-2">
                        {panelBlocks(panelIndex).map((block) => (
                          <button
                            type="button"
                            key={block.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedBlockId(block.id);
                              setSelectedPanelIndex(panelIndex);
                            }}
                            className={`block w-full rounded border bg-background p-3 text-left text-sm shadow-sm transition-colors ${selectedBlock?.id === block.id ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'hover:border-primary/50'}`}
                            draggable={advancedEditing}
                            onDragStart={(event) => event.dataTransfer.setData('text/plain', block.id)}
                          >
                            <strong>{blockLabel(block)}</strong>
                            <span className="ml-2 text-xs text-muted-foreground">{visibilityLabel(block.visibility)}</span>
                          </button>
                        ))}
                      </div>
                      {advancedEditing ? <p className="mt-3 text-xs text-muted-foreground">{t('dropBlocksHere')}</p> : null}
                    </section>
                  ))}
                </div>
              </div>
            ) : previewError ? (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                {previewError}
              </p>
            ) : (
              <div className="mx-auto bg-background shadow-md" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            )}
          </section>
          <aside className="space-y-4 rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:top-16" aria-label={t('properties')}>
            <section>
              <h2 className="font-semibold">{t('properties')}</h2>
              {selectedBlock ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm font-medium">{blockLabel(selectedBlock)}</p>
                  <label className="block space-y-1 text-sm">
                    <span>{t('visibility')}</span>
                    <select
                      className="w-full rounded-md border px-2 py-2"
                      value={selectedBlock.visibility}
                      onChange={(event) =>
                        advancedEditing
                          ? updateAdvancedVisibility(event.target.value as DocumentBlock['visibility'])
                          : updateLayout(
                              setBlockVisibility(
                                document.layout,
                                selectedBlock.id,
                                event.target.value as 'VISIBLE' | 'HIDDEN' | 'HIDE_WHEN_EMPTY'
                              )
                            )
                      }
                    >
                      <option value="VISIBLE">{visibilityLabel('VISIBLE')}</option>
                      <option value="HIDDEN">{visibilityLabel('HIDDEN')}</option>
                      <option value="HIDE_WHEN_EMPTY">{visibilityLabel('HIDE_WHEN_EMPTY')}</option>
                    </select>
                  </label>
                  {advancedEditing ? (
                    <label className="block space-y-1 text-sm">
                      <span>{t('width')}</span>
                      <select
                        className="w-full rounded-md border px-2 py-2"
                        value={selectedBlock.width}
                        onChange={(event) => {
                          const current = currentAdvanced();
                          if (current)
                            runLayoutOperation(() =>
                              applyAdvanced(
                                resizeBlock(current, selectedBlock.id, event.target.value as 'FULL' | 'TWO_THIRDS' | 'HALF' | 'ONE_THIRD')
                              )
                            );
                        }}
                      >
                        <option value="FULL">{widthLabel('FULL')}</option>
                        <option value="TWO_THIRDS">{widthLabel('TWO_THIRDS')}</option>
                        <option value="HALF">{widthLabel('HALF')}</option>
                        <option value="ONE_THIRD">{widthLabel('ONE_THIRD')}</option>
                      </select>
                    </label>
                  ) : null}
                  {'text' in selectedBlock.config ? (
                    <label className="block space-y-1 text-sm">
                      <span>{t('text')}</span>
                      <textarea
                        className="min-h-24 w-full rounded-md border p-2"
                        value={String(selectedBlock.config.text)}
                        onChange={(event) =>
                          updateSelectedBlock(
                            (block) => ({ ...block, config: { ...block.config, text: event.target.value } }) as DocumentBlock
                          )
                        }
                      />
                    </label>
                  ) : null}
                  {selectedBlock.type === 'QR_CODE' || selectedBlock.type === 'CUSTOM_LINK' ? (
                    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-2">
                      <p className="text-xs text-blue-900">{t('linksMustUseHttps')}</p>
                      <label className="block space-y-1 text-sm">
                        <span>{t('visibleLabel')}</span>
                        <input
                          className="w-full rounded border px-2 py-1"
                          value={String((selectedBlock.config as { label?: string }).label ?? '')}
                          onChange={(event) =>
                            updateSelectedBlock(
                              (block) => ({ ...block, config: { ...block.config, label: event.target.value } }) as DocumentBlock
                            )
                          }
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span>{t('httpsUrl')}</span>
                        <input
                          className="w-full rounded border px-2 py-1"
                          type="url"
                          value={String((selectedBlock.config as { href?: string }).href ?? '')}
                          onChange={(event) =>
                            updateSelectedBlock(
                              (block) => ({ ...block, config: { ...block.config, href: event.target.value } }) as DocumentBlock
                            )
                          }
                        />
                        {!safeDigitalUrl(String((selectedBlock.config as { href?: string }).href ?? '')) ? (
                          <span className="text-xs text-red-700">{t('invalidHttpsUrl')}</span>
                        ) : null}
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span>{t('digitalBehavior')}</span>
                        <select
                          className="w-full rounded border px-2 py-1"
                          value={selectedBlock.digitalBehavior}
                          onChange={(event) =>
                            updateSelectedBlock((block) => ({
                              ...block,
                              digitalBehavior: event.target.value as DocumentBlock['digitalBehavior']
                            }))
                          }
                        >
                          <option value="NORMAL">{t('digitalBehaviorOption.NORMAL')}</option>
                          <option value="LINK">{t('digitalBehaviorOption.LINK')}</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t('selectBlockForProperties')}</p>
              )}
            </section>
            {selectedReusable &&
            selectedBlock?.reusableBlockVersion &&
            selectedReusable.current_version > selectedBlock.reusableBlockVersion ? (
              <section className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>{t('newerReusableVersion', { current: selectedReusable.current_version, used: selectedBlock.reusableBlockVersion })}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    onClick={() => updateSelectedFromReusableVersion(selectedReusable)}
                  >
                    {t('updateBlock')}
                  </button>
                  <button type="button" className="rounded border px-2 py-1" onClick={() => setMessage(t('keepingCurrentReusableBlock'))}>
                    {t('keepCurrent')}
                  </button>
                </div>
              </section>
            ) : null}
            {selectedBlock && REUSABLE_BLOCK_TYPES.has(selectedBlock.type) ? (
              <section className="border-t pt-4">
                <h2 className="font-semibold">{t('saveAsReusableBlock')}</h2>
                <div className="mt-3 space-y-2">
                  <input
                    className="w-full rounded-md border px-2 py-2 text-sm"
                    placeholder={t('name')}
                    value={reusableName}
                    onChange={(event) => setReusableName(event.target.value)}
                  />
                  <textarea
                    className="w-full rounded-md border p-2 text-sm"
                    placeholder={t('descriptionOptional')}
                    value={reusableDescription}
                    onChange={(event) => setReusableDescription(event.target.value)}
                  />
                  <select
                    className="w-full rounded-md border px-2 py-2 text-sm"
                    value={reusableScope}
                    onChange={(event) => setReusableScope(event.target.value as typeof reusableScope)}
                  >
                    <option value="PERSONAL">{t('scopeOption.PERSONAL')}</option>
                    <option value="WARD">{t('scopeOption.WARD')}</option>
                    <option value="STAKE">{t('scopeOption.STAKE')}</option>
                  </select>
                  <button
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    disabled={!reusableName.trim() || status === 'saving'}
                    onClick={() =>
                      void saveSelectedAsReusableBlock().catch((error: unknown) =>
                        setMessage(error instanceof Error ? error.message : t('unableSaveReusableBlock'))
                      )
                    }
                  >
                    {t('saveSelectedBlock')}
                  </button>
                </div>
              </section>
            ) : null}
            <section>
              <h2 className="font-semibold">{t('theme')}</h2>
              <div className="mt-3 space-y-3">
                <label className="block space-y-1 text-sm">
                  <span>{t('font')}</span>
                  <select
                    className="w-full rounded-md border px-2 py-2"
                    value={document.layout.theme.fontFamily}
                    onChange={(event) => updateTheme({ fontFamily: event.target.value as DocumentLayout['theme']['fontFamily'] })}
                  >
                    <option value="SYSTEM_SANS">{t('systemSans')}</option>
                    <option value="SERIF">{t('serif')}</option>
                    <option value="MONOSPACE">{t('monospace')}</option>
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span>{t('baseFontSize')}</span>
                  <input
                    className="w-full rounded-md border px-2 py-2"
                    type="number"
                    min={8}
                    max={32}
                    value={document.layout.theme.baseFontSize}
                    onChange={(event) => updateTheme({ baseFontSize: Number(event.target.value) })}
                  />
                </label>
              </div>
            </section>
            {status === 'conflict' ? (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>{message}</p>
                <button
                  type="button"
                  className="rounded border px-2 py-1"
                  onClick={() =>
                    void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Reload failed'))
                  }
                >
                  {t('reloadServer')}
                </button>
              </div>
            ) : null}
            {status === 'error' ? (
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => document && void save(document.layout, document.revision)}
              >
                {t('retrySave')}
              </button>
            ) : null}
            <p className="text-xs text-muted-foreground">{t('privateDraft')}</p>
          </aside>
        </div>
      )}
    </main>
  );
}
