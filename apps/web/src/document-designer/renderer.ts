import { validatePublicDocumentLayout } from './public-safety';
import { downgradeToV1 } from './advanced-schema';
import { renderDocumentBlock, escapeDocumentHtml, blockPresentationStyle } from './block-renderers';
import { isAdvancedLayout, type AdvancedDocumentLayout } from './advanced-schema';
import type { DocumentRenderInput, DocumentRenderOutput } from './render-types';
import { getFoldRegionPlacement } from './print-layout';

export function renderDocumentHtml({
  layout,
  data,
  target = 'DIGITAL',
  public: publicOutput = false,
  explicitPublicBlockTypes = []
}: DocumentRenderInput): DocumentRenderOutput {
  if (publicOutput) validatePublicDocumentLayout(isAdvancedLayout(layout) ? downgradeToV1(layout) : layout, explicitPublicBlockTypes);
  const effectiveTarget = target ?? 'DIGITAL';
  const blocks = layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks.map((block) => ({ region, block }))));
  const content = isAdvancedLayout(layout)
    ? renderAdvanced(layout, data, effectiveTarget)
    : blocks
        .map(
          ({ region, block }) =>
            `<div class="document-region" data-region-id="${region.id}">${renderDocumentBlock(block, data, effectiveTarget)}</div>`
        )
        .join('');
  const foldClass = `document-fold--${layout.fold.toLowerCase()}`;
  const panelCount = layout.fold === 'TRIFOLD' ? 3 : layout.fold === 'NONE' ? 1 : 2;
  const printStyle = `<style>@media print { .document-root { color:#000; } .document-root.${foldClass} { break-inside: avoid; } .document-page + .document-page { break-before: page; page-break-before: always; } .document-page { break-inside: avoid; } .document-block { break-inside: avoid; } } .document-root { font-family:${layout.theme.fontFamily === 'SERIF' ? 'Georgia,serif' : layout.theme.fontFamily === 'MONOSPACE' ? 'ui-monospace,monospace' : 'system-ui,sans-serif'}; font-size:${layout.theme.baseFontSize}px; --document-accent:${layout.theme.accentColor}; } .document-page { height:100vh; box-sizing:border-box; } .document-page h1 { font-size:calc(${layout.theme.baseFontSize}px + 6px); line-height:1.2; margin:.5rem 0; } .document-page h2 { font-size:calc(${layout.theme.baseFontSize}px + 3px); line-height:1.2; margin:.4rem 0; } .document-key-value { display:grid; grid-template-columns:minmax(8rem, 1fr) minmax(0, 2fr); gap:.75rem; padding:.2rem 0; border-bottom:1px solid color-mix(in srgb, var(--document-accent) 18%, transparent); } .document-key-value dt { font-weight:600; } .document-key-value dd { margin:0; } .document-panels { display:grid; height:100%; grid-template-columns:repeat(${panelCount},minmax(0,1fr)); gap:1rem; } .document-panel { min-width:0; min-height:calc(var(--document-region-ratio, 1) * 100%); } .document-columns { display:grid; gap:var(--document-gutter); } .document-columns--2 { grid-template-columns:var(--document-column-ratio,1fr 1fr); } .document-columns--3 { grid-template-columns:repeat(3,1fr); } @media(max-width:640px){.document-panels{grid-template-columns:1fr;}}</style>`;
  const html = `${printStyle}<main class="document-root ${foldClass}" data-document-type="${layout.documentType}" data-target="${effectiveTarget}" aria-label="${escapeDocumentHtml(data.renderLabels?.programTitle ?? 'Sacrament meeting program')}">${content}</main>`;
  return {
    html,
    warnings: data.warnings,
    metadata: {
      target: effectiveTarget,
      documentType: layout.documentType,
      schemaVersion: isAdvancedLayout(layout) ? 1 : layout.schemaVersion,
      blockCount: blocks.length
    }
  };
}

function renderAdvanced(
  layout: AdvancedDocumentLayout,
  data: DocumentRenderInput['data'],
  target: NonNullable<DocumentRenderInput['target']>
): string {
  const panelsPerSide = layout.fold === 'TRIFOLD' ? 3 : layout.fold === 'NONE' ? 1 : 2;
  const physicalSides = (regions: AdvancedDocumentLayout['pages'][number]['regions']) =>
    layout.fold === 'NONE'
      ? [regions]
      : Array.from({ length: 2 }, (_, sideIndex) =>
          Array.from({ length: panelsPerSide }, (_, slotIndex) =>
            regions.find((_, regionIndex) => {
              const placement = getFoldRegionPlacement(layout.fold, regionIndex);
              return placement.sideIndex === sideIndex && placement.slotIndex === slotIndex;
            })
          ).filter((region): region is (typeof regions)[number] => Boolean(region))
        );
  return `<div class="document-pages" data-fold="${layout.fold}">${layout.pages
    .flatMap((page, pageIndex) =>
      physicalSides(page.regions).map(
        (regions, sideIndex) =>
          `<div class="document-page" data-page-index="${pageIndex}" data-side-index="${sideIndex}"><div class="document-panels" data-fold="${layout.fold}" style="${layout.fold === 'NONE' ? `grid-template-rows:${regions.map((region) => `${region.ratio}fr`).join(' ')};` : ''}">${regions
            .map((region, regionIndex) => {
              const columns = Array.from({ length: region.columns.count }, (_, index) => region.columns.blockIds[index] ?? []);
              const byId = new Map<string, AdvancedDocumentLayout['pages'][number]['regions'][number]['blocks'][number]>(
                region.blocks.map((block) => [block.id, block])
              );
              const visibleIds = columns.map((ids) =>
                ids
                  .filter((id) => {
                    const block = byId.get(id);
                    return Boolean(
                      block &&
                      block.visibility !== 'HIDDEN' &&
                      !(target === 'PRINT' && block.printBehavior === 'DIGITAL_ONLY') &&
                      !(target === 'DIGITAL' && block.printBehavior === 'PRINT_ONLY')
                    );
                  })
                  .sort((a, b) =>
                    target === 'DIGITAL'
                      ? (byId.get(a)?.digitalOrder ?? Number.MAX_SAFE_INTEGER) - (byId.get(b)?.digitalOrder ?? Number.MAX_SAFE_INTEGER)
                      : 0
                  )
              );
              const gridTemplate =
                region.columns.count === 2
                  ? region.columns.ratio === '1/3+2/3'
                    ? '1fr 2fr'
                    : region.columns.ratio === '2/3+1/3'
                      ? '2fr 1fr'
                      : '1fr 1fr'
                  : undefined;
              return `<section class="document-panel document-region" data-region-id="${region.id}" aria-label="${escapeDocumentHtml(data.renderLabels?.documentRegion?.replace('{number}', String(regionIndex + 1)) ?? `Program region ${regionIndex + 1}`)}" style="--document-region-ratio:${region.ratio}"><div class="document-columns document-columns--${region.columns.count}" aria-label="${escapeDocumentHtml(data.renderLabels?.documentColumn?.replace('{number}', String(region.columns.count)) ?? `${region.columns.count} columns`)}" style="--document-gutter:${region.columns.gutter}px;${gridTemplate ? `--document-column-ratio:${gridTemplate};` : ''}">${visibleIds
                .map(
                  (ids, columnIndex) =>
                    `<div aria-label="${escapeDocumentHtml(data.renderLabels?.documentColumn?.replace('{number}', String(columnIndex + 1)) ?? `Column ${columnIndex + 1}`)}">${ids
                      .map((id) => {
                        const block = byId.get(id);
                        return block
                          ? `<div class="document-block" data-block-id="${block.id}" style="${blockPresentationStyle(block)}">${renderDocumentBlock(block, data, target)}</div>`
                          : '';
                      })
                      .join('')}</div>`
                )
                .join('')}</div></section>`;
            })
            .join('')}</div></div>`
      )
    )
    .join('')}</div>`;
}
