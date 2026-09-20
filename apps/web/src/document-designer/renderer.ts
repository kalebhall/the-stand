import { validatePublicDocumentLayout } from './public-safety';
import { renderDocumentBlock } from './block-renderers';
import type { DocumentRenderInput, DocumentRenderOutput } from './render-types';

export function renderDocumentHtml({
  layout,
  data,
  target = 'DIGITAL',
  public: publicOutput = false,
  explicitPublicBlockTypes = []
}: DocumentRenderInput): DocumentRenderOutput {
  if (publicOutput) validatePublicDocumentLayout(layout, explicitPublicBlockTypes);

  const blocks = layout.pages.flatMap((page) =>
    page.regions.flatMap((region) =>
      region.blocks.map((block) => ({ region, block }))
    )
  );
  const content = blocks
    .map(({ region, block }) => `<div class="document-region" data-region-id="${region.id}">${renderDocumentBlock(block, data, target)}</div>`)
    .join('');
  const foldClass = ` document-fold--${layout.fold.toLowerCase()}`;
  const printStyle = `<style>@media print { .document-root { color:#000; } .document-root${foldClass} { break-inside: avoid; } .document-block { break-inside: avoid; } } .document-root { font-family:${layout.theme.fontFamily === 'SERIF' ? 'Georgia,serif' : layout.theme.fontFamily === 'MONOSPACE' ? 'ui-monospace,monospace' : 'system-ui,sans-serif'}; font-size:${layout.theme.baseFontSize}px; --document-accent:${layout.theme.accentColor}; } .document-root h1,.document-root h2 { color:var(--document-accent); }</style>`;
  const html = `${printStyle}<main class="document-root${foldClass}" data-document-type="${layout.documentType}" data-target="${target}" aria-label="Sacrament meeting program">${content}</main>`;
  return {
    html,
    warnings: data.warnings,
    metadata: {
      target,
      documentType: layout.documentType,
      schemaVersion: layout.schemaVersion,
      blockCount: blocks.length
    }
  };
}
