import type { DocumentLayout } from '@/src/document-designer/types';

export type DesignerMode = 'EDIT' | 'DIGITAL' | 'PHONE' | 'PRINT';
export type SaveState = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'conflict';

export function moveBlock(layout: DocumentLayout, blockId: string, direction: -1 | 1): DocumentLayout {
  const next = structuredClone(layout);
  for (const page of next.pages) for (const region of page.regions) {
    const index = region.blocks.findIndex((block) => block.id === blockId);
    if (index < 0) continue;
    const target = index + direction;
    if (target < 0 || target >= region.blocks.length) return next;
    const [block] = region.blocks.splice(index, 1);
    region.blocks.splice(target, 0, block);
    return next;
  }
  return next;
}

export function setBlockVisibility(layout: DocumentLayout, blockId: string, visibility: 'VISIBLE' | 'HIDDEN' | 'HIDE_WHEN_EMPTY'): DocumentLayout {
  const next = structuredClone(layout);
  for (const page of next.pages) for (const region of page.regions) for (const block of region.blocks) {
    if (block.id === blockId) { block.visibility = visibility; return next; }
  }
  return next;
}

export function setTheme(layout: DocumentLayout, changes: Partial<DocumentLayout['theme']>): DocumentLayout {
  return { ...structuredClone(layout), theme: { ...layout.theme, ...changes } };
}

export function hasDraftChanged(initial: DocumentLayout | null, current: DocumentLayout | null): boolean {
  return Boolean(initial && current && JSON.stringify(initial) !== JSON.stringify(current));
}

export function modeClass(mode: DesignerMode): string {
  return mode === 'PHONE' ? 'max-w-sm' : mode === 'PRINT' ? 'max-w-3xl print-preview' : 'max-w-5xl';
}
