import type { DocumentBlock } from './types';
import type { AdvancedBlock } from './advanced-schema';
import type { ResolvedDocumentData, RenderTarget } from './render-types';
import { safeUrlSchema } from './primitives';
import { meetingProgramPresentation, meetingProgramPresentationClass } from './meeting-program-presentation';
import {
  announcementListPresentation,
  announcementListPresentationClass,
  orderedAnnouncementItems
} from './announcement-list-presentation';
import {
  orderedSimpleListItems,
  sectionHeadingPresentation,
  sectionHeadingPresentationClass,
  simpleListPresentation,
  simpleListPresentationClass
} from './structural-block-presentation';

export function escapeDocumentHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function textFor(block: DocumentBlock, data: ResolvedDocumentData): string {
  const config = block.config as { text?: string };
  const resolvedBlockText = data.blockValues?.[String(block.id)];
  if (typeof resolvedBlockText === 'string') return resolvedBlockText;
  if (block.type === 'CUSTOM_TEXT' && typeof config.text === 'string') return config.text;
  const resolved = data.values[block.type];
  if (typeof resolved === 'string') return resolved;
  return config.text ?? '';
}

export function blockPresentationStyle(block: DocumentBlock): string {
  const advanced = block as AdvancedBlock;
  const style = advanced.styleOverrides;
  const width = { FULL: '100%', TWO_THIRDS: '66.6667%', HALF: '50%', ONE_THIRD: '33.3333%' }[block.width];
  const declarations = [`max-width:${width}`];
  if (style?.fontFamily)
    declarations.push(
      `font-family:${style.fontFamily === 'SERIF' ? 'Georgia,serif' : style.fontFamily === 'MONOSPACE' ? 'ui-monospace,monospace' : 'system-ui,sans-serif'}`
    );
  if (style?.fontSize) declarations.push(`font-size:${style.fontSize}px`);
  if (style?.align) declarations.push(`text-align:${style.align.toLowerCase()}`);
  if (style?.spacing !== undefined) declarations.push(`margin-bottom:${style.spacing}px`);
  if (style?.border && style.border !== 'NONE') declarations.push(`border:1px ${style.border.toLowerCase()} currentColor`);
  return declarations.join(';');
}

function safeHref(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const isLoopbackHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (url.protocol === 'https:' || isLoopbackHttp) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function renderDocumentBlock(
  block: DocumentBlock,
  data: ResolvedDocumentData,
  target: RenderTarget,
  includeLeadershipInProgram = true
): string {
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
    const labels = data.renderLabels;
    let roles: { presiding?: string; conducting?: string } = {};
    try {
      roles = JSON.parse(data.values.PRESIDING_CONDUCTING ?? '{}') as typeof roles;
    } catch {
      roles = {};
    }
    const rows = [
      [labels?.presiding ?? 'Presiding', roles.presiding ?? ''],
      [labels?.conducting ?? 'Conducting', roles.conducting ?? '']
    ].filter(([, value]) => value.trim());
    if (!rows.length && block.visibility === 'HIDE_WHEN_EMPTY') return '';
    return `<dl class="document-block document-block--key-values">${rows.map(([label, value]) => `<div class="document-key-value"><dt>${escapeDocumentHtml(label)}</dt><dd>${escapeDocumentHtml(value)}</dd></div>`).join('')}</dl>`;
  }
  if (block.type === 'MEETING_PROGRAM') {
    const presentation = meetingProgramPresentation((block.config as { presentation?: unknown }).presentation);
    const labels = data.renderLabels;
    let leadership: { presiding?: string; conducting?: string } = {};
    try {
      leadership = JSON.parse(data.values.PRESIDING_CONDUCTING ?? '{}') as typeof leadership;
    } catch {
      leadership = {};
    }
    const hasLeadership = includeLeadershipInProgram && Boolean(leadership.presiding?.trim() || leadership.conducting?.trim());
    if (!data.meetingItems.length && !hasLeadership && block.visibility === 'HIDE_WHEN_EMPTY') return '';
    const leadershipRows = includeLeadershipInProgram
      ? [
          [labels?.presiding ?? 'Presiding', leadership.presiding ?? ''],
          [labels?.conducting ?? 'Conducting', leadership.conducting ?? '']
        ]
      : [];
    const rows = [
      ...leadershipRows,
      ...data.meetingItems
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => [item.label, item.details?.trim() || '—'] as const)
    ].filter(([, value]) => value.trim());
    return `<section class="document-block document-block--meeting-program ${meetingProgramPresentationClass(presentation)}"><h2>${escapeDocumentHtml(labels?.programTitle ?? 'Program')}</h2><dl class="document-key-values">${rows.map(([label, value]) => `<div class="document-key-value"><dt>${escapeDocumentHtml(label)}</dt><dd>${escapeDocumentHtml(value)}</dd></div>`).join('')}</dl></section>`;
  }
  if (block.type === 'ANNOUNCEMENT_LIST') {
    const config = block.config;
    const items = orderedAnnouncementItems(config.items);
    if (!items.length && block.visibility === 'HIDE_WHEN_EMPTY') return '';
    const labels = data.renderLabels;
    const title = labels?.announcements ?? 'Announcements';
    const presentation = announcementListPresentation(config.presentation);
    const itemHtml = items
      .map((item) => {
        const fields: Array<[string, string | undefined]> = [
          [labels?.announcementDate ?? 'Date', item.date],
          [labels?.announcementTime ?? 'Time', item.time],
          [labels?.announcementLocation ?? 'Location', item.location],
          [labels?.announcementContact ?? 'Contact', item.contact]
        ].filter(([, value]) => Boolean(value?.trim())) as Array<[string, string | undefined]>;
        const details = fields.length
          ? `<dl class="document-announcement-list__details">${fields.map(([label, value]) => `<div><dt>${escapeDocumentHtml(label)}</dt><dd>${escapeDocumentHtml(value!.trim())}</dd></div>`).join('')}</dl>`
          : '';
        const description = item.description?.trim()
          ? `<p class="document-announcement-list__description">${escapeDocumentHtml(item.description.trim())}</p>`
          : '';
        return `<li class="document-announcement-list__item"><h3>${escapeDocumentHtml(item.title)}</h3>${details}${description}</li>`;
      })
      .join('');
    return `<section class="document-block document-announcement-list ${announcementListPresentationClass(presentation)}"><h2>${escapeDocumentHtml(title)}</h2><ul class="document-announcement-list__items">${itemHtml}</ul></section>`;
  }
  if (block.type === 'SECTION_HEADING') {
    const config = block.config;
    const presentation = sectionHeadingPresentation(config.presentation);
    const subtitle = config.subtitle?.trim()
      ? `<p class="document-section-heading__subtitle">${escapeDocumentHtml(config.subtitle.trim())}</p>`
      : '';
    return `<section class="document-block document-section-heading ${sectionHeadingPresentationClass(presentation)}"><h2>${escapeDocumentHtml(config.title.trim())}</h2>${subtitle}</section>`;
  }
  if (block.type === 'SIMPLE_LIST') {
    const presentation = simpleListPresentation(block.config.presentation);
    const ordered = orderedSimpleListItems(block.config.items);
    if (!ordered.length && block.visibility === 'HIDE_WHEN_EMPTY') return '';
    const tag = presentation === 'NUMBERED' ? 'ol' : 'ul';
    const items = ordered.map((item) => `<li>${escapeDocumentHtml(item.text.trim())}</li>`).join('');
    return `<${tag} class="document-block document-simple-list ${simpleListPresentationClass(presentation)}">${items}</${tag}>`;
  }
  if (block.type === 'QR_CODE') {
    const config = block.config as { href?: unknown; label?: unknown };
    const href = safeHref(config.href) ? config.href : safeHref(data.publicUrl) ? data.publicUrl : null;
    const label =
      typeof config.label === 'string' && config.label.trim()
        ? config.label.trim()
        : (data.renderLabels?.qrDigitalProgram ?? 'Open digital program');
    if (!href) return '';
    return `<a class="document-block document-block--qr${block.digitalBehavior === 'LINK' ? ' document-block--digital-link' : ''}" href="${escapeDocumentHtml(href)}" aria-label="${escapeDocumentHtml(label)}">${escapeDocumentHtml(label)}</a>`;
  }
  if (block.type === 'IMAGE') {
    const config = block.config as { assetId: string | null; alt: string; isDecorative: boolean };
    const asset = config.assetId ? data.media?.[config.assetId] : undefined;
    if (!asset || !(asset.url.startsWith('/media/') || safeUrlSchema.safeParse(asset.url).success)) return '';
    const decorative = asset.isDecorative;
    return `<img class="document-block document-block--image" src="${escapeDocumentHtml(asset.url)}" alt="${escapeDocumentHtml(decorative ? '' : (asset.altText ?? config.alt))}"${decorative ? ' aria-hidden="true"' : ''} />`;
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
