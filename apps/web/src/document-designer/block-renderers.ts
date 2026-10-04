import type { DocumentBlock } from './types';
import type { ResolvedDocumentData, RenderTarget } from './render-types';

export function escapeDocumentHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function textFor(block: DocumentBlock, data: ResolvedDocumentData): string {
  const config = block.config as { text?: string };
  if (block.type === 'CUSTOM_TEXT' && typeof config.text === 'string') return config.text;
  const resolved = data.values[block.type];
  if (typeof resolved === 'string') return resolved;
  return config.text ?? '';
}

function safeHref(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
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
  if (block.type === 'PRESIDING_CONDUCTING') {
    let roles: { presiding?: string; conducting?: string } = {};
    try { roles = JSON.parse(data.values.PRESIDING_CONDUCTING ?? '{}') as typeof roles; } catch { roles = {}; }
    const rows = [['Presiding', roles.presiding ?? ''], ['Conducting', roles.conducting ?? '']].filter(([, value]) => value.trim());
    if (!rows.length && block.visibility === 'HIDE_WHEN_EMPTY') return '';
    return `<dl class="document-block document-block--key-values">${rows.map(([label, value]) => `<div class="document-key-value"><dt>${label}</dt><dd>${escapeDocumentHtml(value)}</dd></div>`).join('')}</dl>`;
  }
  if (block.type === 'MEETING_PROGRAM') {
    let leadership: { presiding?: string; conducting?: string } = {};
    try { leadership = JSON.parse(data.values.PRESIDING_CONDUCTING ?? '{}') as typeof leadership; } catch { leadership = {}; }
    const hasLeadership = Boolean(leadership.presiding?.trim() || leadership.conducting?.trim());
    if (!data.meetingItems.length && !hasLeadership && block.visibility === 'HIDE_WHEN_EMPTY') return '';
    const rows = [
      ['Presiding', leadership.presiding ?? ''],
      ['Conducting', leadership.conducting ?? ''],
      ...data.meetingItems.slice().sort((a, b) => a.order - b.order).map((item) => [item.label, item.details?.trim() || '—'] as const)
    ].filter(([, value]) => value.trim());
    return `<section class="document-block document-block--meeting-program"><h2>Program</h2><dl class="document-key-values">${rows.map(([label, value]) => `<div class="document-key-value"><dt>${escapeDocumentHtml(label)}</dt><dd>${escapeDocumentHtml(value)}</dd></div>`).join('')}</dl></section>`;
  }
  if (block.type === 'QR_CODE') {
    const config = block.config as { href?: unknown; label?: unknown };
    const href = safeHref(config.href) ? config.href : (safeHref(data.publicUrl) ? data.publicUrl : null);
    const label = typeof config.label === 'string' && config.label.trim() ? config.label.trim() : 'Open digital program';
    if (!href) return '';
    return `<a class="document-block document-block--qr${block.digitalBehavior === 'LINK' ? ' document-block--digital-link' : ''}" href="${escapeDocumentHtml(href)}" aria-label="${escapeDocumentHtml(label)}">${escapeDocumentHtml(label)}</a>`;
  }
  if (block.type === 'IMAGE') {
    const config = block.config as { assetId: string | null; alt: string; isDecorative: boolean };
    const asset = config.assetId ? data.media?.[config.assetId] : undefined;
    if (!asset) return '';
    return `<img class="document-block document-block--image" src="${escapeDocumentHtml(asset.url)}" alt="${escapeDocumentHtml(asset.isDecorative ? '' : (asset.altText ?? config.alt))}"${asset.isDecorative ? ' aria-hidden="true"' : ''} />`;
  }
  if (block.type === 'CUSTOM_LINK') {
    const config = block.config as { label?: unknown; href?: unknown };
    if (!safeHref(config.href) || typeof config.label !== 'string' || !config.label.trim()) return '';
    return `<a class="document-block document-block--link${block.digitalBehavior === 'LINK' ? ' document-block--digital-link' : ''}" href="${escapeDocumentHtml(config.href)}">${escapeDocumentHtml(config.label.trim())}</a>`;
  }

  const text = textFor(block, data);
  if (!text && block.visibility === 'HIDE_WHEN_EMPTY') return '';
  const headingTypes = new Set(['DOCUMENT_TITLE', 'WARD_NAME', 'MEETING_INFO']);
  const tag = headingTypes.has(block.type) ? 'h1' : 'p';
  return `<${tag} class="document-block document-block--${block.type.toLowerCase()}">${escapeDocumentHtml(text || '—')}</${tag}>`;
}
