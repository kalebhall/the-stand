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
  mobile = false,
  public: publicOutput = false,
  explicitPublicBlockTypes = []
}: DocumentRenderInput): DocumentRenderOutput {
  if (publicOutput) validatePublicDocumentLayout(isAdvancedLayout(layout) ? downgradeToV1(layout) : layout, explicitPublicBlockTypes);
  const effectiveTarget = target ?? 'DIGITAL';
  const blocks = layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks.map((block) => ({ region, block }))));
  const hasSeparateLeadershipBlock = blocks.some(
    ({ block }) =>
      block.type === 'PRESIDING_CONDUCTING' &&
      block.visibility !== 'HIDDEN' &&
      !(effectiveTarget === 'PRINT' && block.printBehavior === 'DIGITAL_ONLY') &&
      !(effectiveTarget === 'DIGITAL' && block.printBehavior === 'PRINT_ONLY')
  );
  const includeLeadershipInProgram = !hasSeparateLeadershipBlock;
  const content = isAdvancedLayout(layout)
    ? renderAdvanced(layout, data, effectiveTarget, includeLeadershipInProgram)
    : blocks
        .map(
          ({ region, block }) =>
            `<div class="document-region" data-region-id="${region.id}">${renderDocumentBlock(block, data, effectiveTarget, includeLeadershipInProgram)}</div>`
        )
        .join('');
  const foldClass = `document-fold--${layout.fold.toLowerCase()}`;
  const mobileClass = mobile && effectiveTarget === 'DIGITAL' ? ' document-root--mobile' : '';
  const panelCount = layout.fold === 'TRIFOLD' ? 3 : layout.fold === 'NONE' ? 1 : 2;
  const responsiveStyles =
    effectiveTarget === 'DIGITAL'
      ? '@media screen and (max-width:640px){.document-panels{grid-template-columns:1fr;}.document-columns{grid-template-columns:1fr !important;}.document-block{max-width:100% !important;width:100% !important;}.document-key-value{grid-template-columns:1fr;}.document-meeting-program--dotted-leaders .document-key-value{display:grid;grid-template-columns:1fr;text-align:left;}.document-meeting-program--dotted-leaders dt::after{display:none;}.document-meeting-program--dotted-leaders dd{text-align:left;}} @media screen{.document-root--mobile .document-panels,.document-root--mobile .document-columns{grid-template-columns:1fr !important;}.document-root--mobile .document-block{max-width:100% !important;width:100% !important;}.document-root--mobile .document-key-value{grid-template-columns:1fr;}.document-root--mobile .document-meeting-program--dotted-leaders .document-key-value{display:grid;grid-template-columns:1fr;text-align:left;}.document-root--mobile .document-meeting-program--dotted-leaders dt::after{display:none;}.document-root--mobile .document-meeting-program--dotted-leaders dd{text-align:left;}}'
      : '';
  const announcementStyles =
    '.document-announcement-list__items{list-style:none;margin:0;padding:0}.document-announcement-list__item{border-bottom:1px solid color-mix(in srgb,var(--document-accent) 18%,transparent);padding:.45rem 0}.document-announcement-list__item h3{font-size:1em;font-weight:600;margin:0 0 .2rem;white-space:pre-line}.document-announcement-list__details{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.1rem .75rem;margin:0}.document-announcement-list__details>div{display:flex;gap:.35rem;min-width:0}.document-announcement-list__details dt{font-weight:600}.document-announcement-list__details dd{margin:0;white-space:pre-line}.document-announcement-list__description{margin:.2rem 0 0;white-space:pre-line}.document-announcement-list--detail-cards .document-announcement-list__item{border:1px solid color-mix(in srgb,var(--document-accent) 30%,transparent);border-radius:.4rem;margin:.4rem 0;padding:.65rem}.document-announcement-list--detail-cards .document-announcement-list__details{grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))}';
  const structuralStyles =
    '.document-section-heading{margin:.5rem 0}.document-section-heading h2{margin:0;white-space:pre-line}.document-section-heading__subtitle{margin:.2rem 0 0;white-space:pre-line}.document-section-heading--rule{border-bottom:1px solid color-mix(in srgb,var(--document-accent) 45%,transparent);padding-bottom:.35rem}.document-section-heading--accent{border-left:4px solid var(--document-accent);padding:.25rem .65rem;background:color-mix(in srgb,var(--document-accent) 8%,transparent)}.document-simple-list{padding-left:1.5rem}.document-simple-list--bullets{list-style:disc}.document-simple-list--numbered{list-style:decimal}.document-simple-list--compact-rows{list-style:none;padding-left:0}.document-simple-list li{white-space:pre-line}.document-simple-list--compact-rows li{border-bottom:1px solid color-mix(in srgb,var(--document-accent) 18%,transparent);padding:.25rem 0}';
  const announcementResponsiveStyles =
    effectiveTarget === 'DIGITAL'
      ? '@media screen and (max-width:640px){.document-announcement-list__details{grid-template-columns:1fr!important}} @media screen{.document-root--mobile .document-announcement-list__details{grid-template-columns:1fr!important}}'
      : '';
  const printStyle = `<style>${announcementStyles}${announcementResponsiveStyles}@media print { .document-root { color:#000; } .document-root.${foldClass} { break-inside: avoid; } .document-page + .document-page { break-before: page; page-break-before: always; } .document-page { break-inside: avoid; } .document-block { break-inside: avoid; } } .document-root { font-family:${layout.theme.fontFamily === 'SERIF' ? 'Georgia,serif' : layout.theme.fontFamily === 'MONOSPACE' ? 'ui-monospace,monospace' : 'system-ui,sans-serif'}; font-size:${layout.theme.baseFontSize}px; --document-accent:${layout.theme.accentColor}; } .document-page { height:100vh; box-sizing:border-box; } .document-page h1 { font-size:calc(${layout.theme.baseFontSize}px + 6px); line-height:1.2; margin:.5rem 0; } .document-page h2 { font-size:calc(${layout.theme.baseFontSize}px + 3px); line-height:1.2; margin:.4rem 0; } .document-key-value { display:grid; grid-template-columns:minmax(8rem, 1fr) minmax(0, 2fr); gap:.75rem; padding:.2rem 0; border-bottom:1px solid color-mix(in srgb, var(--document-accent) 18%, transparent); } .document-key-value dt { font-weight:600; } .document-key-value dd { margin:0; white-space:pre-line; } .document-meeting-program--dotted-leaders .document-key-value { display:flex; align-items:baseline; gap:.5rem; } .document-meeting-program--dotted-leaders dt { display:flex; flex:1; min-width:0; align-items:baseline; } .document-meeting-program--dotted-leaders dt::after { content:''; flex:1; margin:0 .5rem; border-bottom:1px dotted currentColor; } .document-meeting-program--dotted-leaders dd { text-align:right; } .document-meeting-program--centered-stacked .document-key-value { display:block; text-align:center; } .document-meeting-program--centered-stacked dd { margin-top:.1rem; } .document-panels { display:grid; height:100%; grid-template-columns:repeat(${panelCount},minmax(0,1fr)); gap:1rem; } .document-panel { min-width:0; min-height:calc(var(--document-region-ratio, 1) * 100%); } .document-columns { display:grid; gap:var(--document-gutter); } .document-columns--2 { grid-template-columns:var(--document-column-ratio,1fr 1fr); } .document-columns--3 { grid-template-columns:repeat(3,1fr); } ${responsiveStyles}</style>`;
  const html = `${printStyle}<main class="document-root ${foldClass}${mobileClass}" data-document-type="${layout.documentType}" data-target="${effectiveTarget}" aria-label="${escapeDocumentHtml(data.renderLabels?.programTitle ?? 'Sacrament meeting program')}"><style>${structuralStyles}</style>${content}</main>`;
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
  target: NonNullable<DocumentRenderInput['target']>,
  includeLeadershipInProgram: boolean
): string {
  const panelsPerSide = layout.fold === 'TRIFOLD' ? 3 : layout.fold === 'NONE' ? 1 : 2;
  const physicalSides = (regions: AdvancedDocumentLayout['pages'][number]['regions']) =>
    layout.fold === 'NONE'
      ? [regions]
      : Array.from({ length: 2 }, (_, sideIndex) =>
          Array.from({ length: panelsPerSide }, (_, slotIndex) =>
            regions.find((region, regionIndex) => {
              const placement = getFoldRegionPlacement(layout.fold, regionIndex, region.face);
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
              return `<section class="document-panel document-region" data-region-id="${region.id}" data-region-face="${region.face ?? ''}" aria-label="${escapeDocumentHtml(data.renderLabels?.documentRegion?.replace('{number}', String(regionIndex + 1)) ?? `Program region ${regionIndex + 1}`)}" style="--document-region-ratio:${region.ratio}"><div class="document-columns document-columns--${region.columns.count}" aria-label="${escapeDocumentHtml(data.renderLabels?.documentColumn?.replace('{number}', String(region.columns.count)) ?? `${region.columns.count} columns`)}" style="--document-gutter:${region.columns.gutter}px;${gridTemplate ? `--document-column-ratio:${gridTemplate};` : ''}">${visibleIds
                .map(
                  (ids, columnIndex) =>
                    `<div aria-label="${escapeDocumentHtml(data.renderLabels?.documentColumn?.replace('{number}', String(columnIndex + 1)) ?? `Column ${columnIndex + 1}`)}">${ids
                      .map((id) => {
                        const block = byId.get(id);
                        return block
                          ? `<div class="document-block" data-block-id="${block.id}" style="${blockPresentationStyle(block)}">${renderDocumentBlock(block, data, target, includeLeadershipInProgram)}</div>`
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
