export type MeetingRenderItem = {
  itemType: string;
  title: string | null;
  notes: string | null;
  hymnNumber: string | null;
  hymnTitle: string | null;
};

export type MeetingRenderInput = {
  meetingDate: string;
  meetingType: string;
  programItems: MeetingRenderItem[];
};

const SACRAMENT_PRAYERS = [
  'Bread prayer: O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this bread to the souls of all those who partake of it...',
  'Water prayer: O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this water to the souls of all those who drink of it...'
];

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function displayHymn(item: MeetingRenderItem) {
  if (item.hymnNumber || item.hymnTitle) {
    return [item.hymnNumber ? `#${item.hymnNumber}` : null, item.hymnTitle || null].filter(Boolean).join(' — ');
  }

  return item.title ?? '';
}

export function buildMeetingRenderHtml({ meetingDate, meetingType, programItems }: MeetingRenderInput) {
  const escapedDate = escapeHtml(meetingDate);
  const escapedType = escapeHtml(meetingType.replaceAll('_', ' '));

  const itemsHtml = programItems
    .map((item) => {
      const label = escapeHtml(item.itemType.replaceAll('_', ' '));
      const value = escapeHtml(displayHymn(item) || '—');
      const notes = item.notes ? `<p class="text-xs text-muted-foreground">${escapeHtml(item.notes)}</p>` : '';

      return `<article class="grid grid-cols-[10rem_1fr] gap-3 border-b py-2"><p class="text-sm font-medium">${label}</p><div class="space-y-1"><p class="text-sm">${value}</p>${notes}</div></article>`;
    })
    .join('');

  const prayersHtml = SACRAMENT_PRAYERS
    .map((line) => `<p class="text-xs leading-relaxed text-muted-foreground">${escapeHtml(line)}</p>`)
    .join('');

  return `<main class="print-page mx-auto max-w-3xl space-y-6 p-4 sm:p-8"><header class="space-y-2 border-b pb-4 text-center"><h1 class="text-2xl font-semibold">Sacrament Meeting Program</h1><p class="text-sm text-muted-foreground">${escapedDate}</p><p class="text-sm text-muted-foreground">${escapedType}</p></header><section class="space-y-2">${itemsHtml}</section><section class="space-y-2"><h2 class="text-base font-semibold">Sacrament Prayers</h2>${prayersHtml}</section></main>`;
}
