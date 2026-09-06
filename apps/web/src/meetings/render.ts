import QRCode from 'qrcode';
import { isAnnouncementActiveForDate, type AnnouncementRenderItem } from '../announcements/types';
import { getProgramItemLabel, INTRODUCTION_ITEM_TYPE, type IntroductionRoles } from './types';
import type { PublicAnnouncementMode, PublicCoverMode, PublicLayoutPreset } from './public-layout';

export type MeetingRenderItem = {
  itemType: string;
  title: string | null;
  notes: string | null;
  topic?: string | null;
  programNotes?: string | null;
  introductionRoles?: IntroductionRoles | null;
  hymnNumber: string | null;
  hymnTitle: string | null;
};

export type MeetingRenderInput = {
  meetingDate: string;
  meetingType: string;
  programItems: MeetingRenderItem[];
  announcements?: AnnouncementRenderItem[];
  publicUrl?: string;
  layout?: {
    preset: PublicLayoutPreset;
    announcementMode: PublicAnnouncementMode;
    coverMode: PublicCoverMode;
    coverImageUrl?: string | null;
    coverImageAltText?: string | null;
  };
};

const SACRAMENT_PRAYERS = [
  'Bread prayer: O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this bread to the souls of all those who partake of it...',
  'Water prayer: O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this water to the souls of all those who drink of it...'
];

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function displayHymn(item: MeetingRenderItem) {
  if (item.hymnNumber || item.hymnTitle) {
    return [item.hymnNumber ? `#${item.hymnNumber}` : null, item.hymnTitle || null].filter(Boolean).join(' — ');
  }

  return item.title ?? '';
}

function displayTopic(item: MeetingRenderItem) {
  return item.itemType.toUpperCase() === 'SPEAKER' && item.topic?.trim() ? item.topic.trim() : '';
}

function renderQrCode(url: string | undefined) {
  if (!url) return '';
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const cells = Array.from(qr.modules.data).map((dark, index) => dark ? `<rect x="${index % size}" y="${Math.floor(index / size)}" width="1" height="1" />` : '').join('');
  return `<a href="${escapeHtml(url)}" class="public-program__qr" aria-label="Open digital program"><svg viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code for digital program" shape-rendering="crispEdges">${cells}</svg></a>`;
}

function renderAnnouncementBlock(items: AnnouncementRenderItem[]) {
  if (!items.length) {
    return '';
  }

  return `<section class="space-y-2"><h2 class="text-base font-semibold">Announcements</h2>${items
    .map((item) => {
      const body = item.body ? `<p class="text-sm text-muted-foreground">${escapeHtml(item.body)}</p>` : '';
      return `<article class="rounded border p-3"><p class="text-sm font-medium">${escapeHtml(item.title)}</p>${body}</article>`;
    })
    .join('')}</section>`;
}

export function buildMeetingRenderHtml({ meetingDate, meetingType, programItems, announcements = [], publicUrl, layout }: MeetingRenderInput) {
  const selectedLayout = layout ?? { preset: 'FULL_PAGE' as const, announcementMode: 'AFTER_PROGRAM' as const, coverMode: 'NONE' as const };
  const escapedDate = escapeHtml(meetingDate);
  const escapedType = escapeHtml(meetingType.replaceAll('_', ' '));
  const layoutClass = `public-program public-program--${selectedLayout.preset.toLowerCase()}`;
  const foldGuide = selectedLayout.preset === 'FULL_PAGE' ? '' : '<div class="print-fold-guides" aria-hidden="true"></div>';
  const printStyles = `<style>@media print { .public-program { max-width: none !important; color: #000 !important; } .public-program--single_sheet_bifold, .public-program--tri_fold_bulletin { column-gap: 0.25in; column-fill: auto; height: 10in; } .public-program--single_sheet_bifold { column-count: 2; } .public-program--tri_fold_bulletin { column-count: 3; } .public-program--single_sheet_bifold .public-program__cover, .public-program--tri_fold_bulletin .public-program__cover { column-span: all; } .public-program--single_sheet_bifold article, .public-program--tri_fold_bulletin article, .print-fold-guides { break-inside: avoid; } .public-program--single_sheet_bifold section, .public-program--tri_fold_bulletin section { break-inside: avoid; } .print-fold-guides { position: absolute; inset: 0; pointer-events: none; border-left: 1px dashed #999; border-right: 1px dashed #999; } .public-program--single_sheet_bifold .print-fold-guides { left: 50%; right: 50%; } .public-program--tri_fold_bulletin .print-fold-guides { left: 33.333%; right: 33.333%; } .public-program__qr { display: inline-block; width: 1.25in; height: 1.25in; } .public-program__qr svg { width: 100%; height: 100%; background: #fff; fill: #000; padding: 0.08in; } .public-program--full_page { column-count: 1; } } @media screen { .print-fold-guides { display: none; } }</style>`;
  const cover = selectedLayout.coverMode === 'AUTHORIZED_IMAGE' && selectedLayout.coverImageUrl && selectedLayout.coverImageAltText
    ? `<img src="${escapeHtml(selectedLayout.coverImageUrl)}" alt="${escapeHtml(selectedLayout.coverImageAltText)}" class="mx-auto max-h-48 max-w-full object-contain" />`
    : '';

  const activeAnnouncements = announcements
    .filter((item) => item.includeInProgram !== false)
    .filter((item) => isAnnouncementActiveForDate(item, meetingDate));
  const topAnnouncements = selectedLayout.announcementMode === 'NONE' ? [] : activeAnnouncements.filter((item) => item.placement === 'PROGRAM_TOP');
  const bottomAnnouncements = selectedLayout.announcementMode === 'NONE' ? [] : activeAnnouncements.filter((item) => selectedLayout.announcementMode === 'BACK_PANEL' || item.placement === 'PROGRAM_BOTTOM');

  const itemsHtml = programItems
    .map((item) => {
      if (item.itemType.toUpperCase() === INTRODUCTION_ITEM_TYPE) {
        const roles = item.introductionRoles ?? { presiding: '', conducting: '', organist: '', chorister: '' };
        const roleRows = [
          ['Presiding', roles.presiding],
          ['Conducting', roles.conducting],
          ['Organist / Pianist', roles.organist],
          ['Chorister', roles.chorister]
        ]
          .map(
            ([role, name]) =>
              `<div class="grid grid-cols-[10rem_1fr] gap-3 border-b py-2"><p class="text-sm font-medium">${role}</p><p class="text-sm">${escapeHtml(name || '—')}</p></div>`
          )
          .join('');
        const notes = item.programNotes?.trim() || item.notes?.trim();
        const notesHtml = notes ? `<p class="text-xs text-muted-foreground">${escapeHtml(notes)}</p>` : '';
        return `<article class="space-y-1"><h2 class="border-b pb-1 text-base font-semibold">Introduction</h2>${roleRows}${notesHtml}</article>`;
      }
      const label = escapeHtml(getProgramItemLabel(item.itemType));
      const value = escapeHtml(displayHymn(item) || '—');
      const topic = displayTopic(item);
      const topicHtml = topic ? `<p class="text-sm text-muted-foreground">${escapeHtml(topic)}</p>` : '';
      const notes =
        (item.programNotes ?? item.notes)
          ? `<p class="text-xs text-muted-foreground">${escapeHtml(item.programNotes ?? item.notes ?? '')}</p>`
          : '';

      return `<article class="grid grid-cols-[10rem_1fr] gap-3 border-b py-2"><p class="text-sm font-medium">${label}</p><div class="space-y-1"><p class="text-sm">${value}</p>${topicHtml}${notes}</div></article>`;
    })
    .join('');

  const prayersHtml = SACRAMENT_PRAYERS.map(
    (line) => `<p class="text-xs leading-relaxed text-muted-foreground">${escapeHtml(line)}</p>`
  ).join('');

  return `${printStyles}<main class="${layoutClass} mx-auto max-w-3xl space-y-6 p-4 sm:p-8" aria-labelledby="public-program-title" data-layout-preset="${selectedLayout.preset}" data-announcement-mode="${selectedLayout.announcementMode}"><header class="public-program__cover space-y-2 border-b pb-4 text-center"><h1 id="public-program-title" class="text-2xl font-semibold">Sacrament Meeting Program</h1><p class="text-sm text-muted-foreground">${escapedDate}</p><p class="text-sm text-muted-foreground">${escapedType}</p>${cover}</header>${foldGuide}${renderAnnouncementBlock(topAnnouncements)}<section class="space-y-2">${itemsHtml}</section>${renderAnnouncementBlock(bottomAnnouncements)}<section class="space-y-2"><h2 class="text-base font-semibold">Sacrament Prayers</h2>${prayersHtml}</section>${renderQrCode(publicUrl)}</main>`;
}
