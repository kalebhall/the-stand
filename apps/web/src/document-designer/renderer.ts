import { validatePublicDocumentLayout } from './public-safety';
import { downgradeToV1 } from './advanced-schema';
import { renderDocumentBlock } from './block-renderers';
import { isAdvancedLayout, type AdvancedDocumentLayout } from './advanced-schema';
import type { DocumentRenderInput, DocumentRenderOutput } from './render-types';

export function renderDocumentHtml({ layout, data, target = 'DIGITAL', public: publicOutput = false, explicitPublicBlockTypes = [] }: DocumentRenderInput): DocumentRenderOutput {
  if (publicOutput) validatePublicDocumentLayout(isAdvancedLayout(layout) ? downgradeToV1(layout) : layout, explicitPublicBlockTypes);
  const effectiveTarget = target ?? 'DIGITAL';
  const blocks = layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks.map((block) => ({ region, block }))));
  const content = isAdvancedLayout(layout)
    ? renderAdvanced(layout, data, effectiveTarget)
    : blocks.map(({ region, block }) => `<div class="document-region" data-region-id="${region.id}">${renderDocumentBlock(block, data, effectiveTarget)}</div>`).join('');
  const foldClass = ` document-fold--${layout.fold.toLowerCase()}`;
  const printStyle = `<style>@media print { .document-root { color:#000; } .document-root${foldClass} { break-inside: avoid; } .document-block { break-inside: avoid; } } .document-root { font-family:${layout.theme.fontFamily === 'SERIF' ? 'Georgia,serif' : layout.theme.fontFamily === 'MONOSPACE' ? 'ui-monospace,monospace' : 'system-ui,sans-serif'}; font-size:${layout.theme.baseFontSize}px; --document-accent:${layout.theme.accentColor}; } .document-root h1,.document-root h2 { color:var(--document-accent); } .document-panels { display:grid; grid-template-columns:${layout.fold === 'BIFOLD' ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)'}; gap:1rem; } .document-panel { min-width:0; } .document-columns { display:grid; gap:var(--document-gutter); } .document-columns--2 { grid-template-columns:var(--document-column-ratio,1fr 1fr); } .document-columns--3 { grid-template-columns:repeat(3,1fr); } @media(max-width:640px){.document-panels{grid-template-columns:1fr;}}</style>`;
  const html = `${printStyle}<main class="document-root${foldClass}" data-document-type="${layout.documentType}" data-target="${effectiveTarget}" aria-label="Sacrament meeting program">${content}</main>`;
  return { html, warnings: data.warnings, metadata: { target: effectiveTarget, documentType: layout.documentType, schemaVersion: isAdvancedLayout(layout) ? 1 : layout.schemaVersion, blockCount: blocks.length } };
}

function renderAdvanced(layout: AdvancedDocumentLayout, data: DocumentRenderInput['data'], target: NonNullable<DocumentRenderInput['target']>): string {
  const regions = layout.pages.flatMap((page) => page.regions);
  return `<div class="document-panels" data-fold="${layout.fold}">${regions.map((region) => {
    const columns = Array.from({ length: region.columns.count }, (_, index) => region.columns.blockIds[index] ?? []);
    const byId = new Map<string, AdvancedDocumentLayout['pages'][number]['regions'][number]['blocks'][number]>(region.blocks.map((block) => [block.id, block]));
    const visibleIds = columns.map((ids) => ids.filter((id) => {
      const block = byId.get(id);
      return Boolean(block && block.visibility !== 'HIDDEN' && !(target === 'PRINT' && block.printBehavior === 'DIGITAL_ONLY') && !(target === 'DIGITAL' && block.printBehavior === 'PRINT_ONLY'));
    }).sort((a, b) => target === 'DIGITAL' ? (byId.get(a)?.digitalOrder ?? Number.MAX_SAFE_INTEGER) - (byId.get(b)?.digitalOrder ?? Number.MAX_SAFE_INTEGER) : 0));
    const gridTemplate = region.columns.count === 2 ? (region.columns.ratio === '1/3+2/3' ? '1fr 2fr' : region.columns.ratio === '2/3+1/3' ? '2fr 1fr' : '1fr 1fr') : undefined;
    return `<section class="document-panel document-region" data-region-id="${region.id}" aria-label="Program region ${region.id}" style="--document-region-ratio:${region.ratio}"><div class="document-columns document-columns--${region.columns.count}" aria-label="${region.columns.count} columns" style="--document-gutter:${region.columns.gutter}px;${gridTemplate ? `--document-column-ratio:${gridTemplate};` : ''}">${visibleIds.map((ids, columnIndex) => `<div aria-label="Column ${columnIndex + 1}">${ids.map((id) => { const block = byId.get(id); return block ? `<div class="document-block" data-block-id="${block.id}">${renderDocumentBlock(block, data, target)}</div>` : ''; }).join('')}</div>`).join('')}</div></section>`;
  }).join('')}</div>`;
}
