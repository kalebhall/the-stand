import type { DocumentBlock } from './types';
import type { ResolvedDocumentData, RenderTarget } from './render-types';

export function escapeDocumentHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function textFor(block: DocumentBlock, data: ResolvedDocumentData): string {
  const resolved = data.values[block.type];
  if (typeof resolved === 'string') return resolved;
  const config = block.config as { text?: string };
  return config.text ?? '';
}

export function renderDocumentBlock(block: DocumentBlock, data: ResolvedDocumentData, target: RenderTarget): string {
  if (block.visibility === 'HIDDEN') return '';
  if (block.printBehavior === 'DIGITAL_ONLY' && target === 'PRINT') return '';
  if (block.printBehavior === 'PRINT_ONLY' && target === 'DIGITAL') return '';

  if (block.type === 'DIVIDER') {
    const style = (block.config as { style: string }).style;
    return `<hr class="document-block document-block--divider document-block--divider-${style.toLowerCase()}" />`;
  }
  if (block.type === 'SPACER') {
    const height = (block.config as { height: number }).height;
    return `<div class="document-block document-block--spacer" style="height:${Math.min(height, 720)}px" aria-hidden="true"></div>`;
  }
  if (block.type === 'MEETING_PROGRAM') {
    if (!data.meetingItems.length && block.visibility === 'HIDE_WHEN_EMPTY') return '';
    const items = data.meetingItems
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => `<li><span class="document-program__label">${escapeDocumentHtml(item.label)}</span>${item.details ? `<span class="document-program__details">${escapeDocumentHtml(item.details)}</span>` : ''}</li>`)
      .join('');
    return `<section class="document-block document-block--meeting-program"><h2>Program</h2><ol>${items}</ol></section>`;
  }
  if (block.type === 'QR_CODE' && data.publicUrl) {
    return `<a class="document-block document-block--qr" href="${escapeDocumentHtml(data.publicUrl)}" aria-label="Open digital program">Open digital program</a>`;
  }
  if (block.type === 'IMAGE') {
    const config = block.config as { assetId: string | null; alt: string; isDecorative: boolean };
    const asset = config.assetId ? data.media?.[config.assetId] : undefined;
    if (!asset) return '';
    return `<img class="document-block document-block--image" src="${escapeDocumentHtml(asset.url)}" alt="${escapeDocumentHtml(asset.isDecorative ? '' : (asset.altText ?? config.alt))}"${asset.isDecorative ? ' aria-hidden="true"' : ''} />`;
  }
  if (block.type === 'CUSTOM_LINK') {
    const config = block.config as { label: string; href: string };
    return `<a class="document-block document-block--link" href="${escapeDocumentHtml(config.href)}">${escapeDocumentHtml(config.label)}</a>`;
  }

  const text = textFor(block, data);
  if (!text && block.visibility === 'HIDE_WHEN_EMPTY') return '';
  const headingTypes = new Set(['DOCUMENT_TITLE', 'WARD_NAME', 'MEETING_INFO']);
  const tag = headingTypes.has(block.type) ? 'h1' : 'p';
  return `<${tag} class="document-block document-block--${block.type.toLowerCase()}">${escapeDocumentHtml(text || '—')}</${tag}>`;
}
