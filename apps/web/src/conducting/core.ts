import type { Meeting, MeetingContext, ProgramItem } from './model';

export type PrepView = {
  kind: 'prep';
  meeting: Meeting;
  items: ProgramItem[];
  readyToPublish: boolean;
  blockers: string[];
};

export type ConductView = {
  kind: 'conduct';
  meeting: Meeting;
  rows: ConductRow[];
};

export type ConductRow =
  | { kind: 'welcome'; text: string }
  | { kind: 'item'; programItemId: string; label: string; details: string }
  | { kind: 'sacrament'; programItemId: string; text: string };

function labelFor(item: ProgramItem): string {
  if (item.itemType.toUpperCase() === 'ORGANIST_PIANIST') return 'Organist / Pianist';
  return item.itemType.replaceAll('_', ' ');
}

function detailsFor(item: ProgramItem): string {
  return [item.title, item.topic, item.hymnNumber && item.hymnTitle ? `#${item.hymnNumber} — ${item.hymnTitle}` : item.hymnTitle, item.notes]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');
}

export function buildPrepView(context: MeetingContext): PrepView {
  const blockers = context.meeting.programItems.flatMap((item) => {
    if (item.itemType.toUpperCase() === 'SPEAKER' && !item.topic?.trim()) return [`Speaker topic missing for ${item.title || 'unassigned speaker'}.`];
    return [];
  });
  return {
    kind: 'prep',
    meeting: context.meeting,
    items: [...context.meeting.programItems],
    readyToPublish: blockers.length === 0,
    blockers
  };
}

export function buildConductView(context: MeetingContext): ConductView {
  const rows: ConductRow[] = [{ kind: 'welcome', text: 'Welcome to the meeting.' }];
  for (const item of context.meeting.programItems) {
    if (item.itemType.toUpperCase() === 'SACRAMENT') {
      rows.push({ kind: 'sacrament', programItemId: item.id, text: 'Sacrament' });
    } else {
      rows.push({ kind: 'item', programItemId: item.id, label: labelFor(item), details: detailsFor(item) });
    }
  }
  return { kind: 'conduct', meeting: context.meeting, rows };
}

export type BasicRenderInput = Pick<Meeting, 'meetingDate' | 'meetingType' | 'programItems'> & { wardName?: string };

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderBasicProgram(input: BasicRenderInput): string {
  const items = input.programItems.map((item) => {
    const details = detailsFor(item) || '—';
    return `<li data-program-item-id="${escapeHtml(item.id)}"><strong>${escapeHtml(labelFor(item))}</strong><span>${escapeHtml(details)}</span></li>`;
  }).join('');
  const type = escapeHtml(input.meetingType.replaceAll('_', ' '));
  const ward = input.wardName ? `<p>${escapeHtml(input.wardName)}</p>` : '';
  return `<main data-core-render="basic"><h1>Sacrament Meeting Program</h1>${ward}<p>${escapeHtml(input.meetingDate)}</p><p>${type}</p><ol>${items}</ol></main>`;
}

export function isCoreAnnouncementActiveForDate(
  input: { startDate: string | null; endDate: string | null; isPermanent: boolean },
  meetingDate: string
): boolean {
  if (input.isPermanent) return true;
  return (!input.startDate || input.startDate <= meetingDate) && (!input.endDate || input.endDate >= meetingDate);
}
