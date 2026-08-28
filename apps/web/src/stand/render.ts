import {
  DEFAULT_STAND_RELEASE_TEMPLATE,
  DEFAULT_STAND_SUSTAIN_TEMPLATE,
  DEFAULT_STAND_WELCOME_TEXT
} from './default-template';
import { formatAtStandMemberName, type MemberDisplayInfo } from './member-display';

export type StandProgramItem = {
  id: string;
  itemType: string;
  title: string | null;
  member?: MemberDisplayInfo;
  notes: string | null;
  programNotes?: string | null;
  hymnNumber: string | null;
  hymnTitle: string | null;
};

export type StandTemplate = {
  welcomeText: string;
  sustainTemplate: string;
  releaseTemplate: string;
};

export type StandRow =
  | {
      kind: 'welcome';
      text: string;
    }
  | {
      kind: 'standard';
      programItemId?: string;
      programNotes?: string | null;
      label: string;
      details: string;
    }
  | {
      kind: 'sustain' | 'release';
      programItemId: string;
      programNotes?: string | null;
      segments: Array<{ text: string; bold: boolean }>;
      summary: string;
    }
  | { kind: 'ward_business'; programItemId: string; programNotes?: string | null };

const DEFAULT_TEMPLATE: StandTemplate = {
  welcomeText: DEFAULT_STAND_WELCOME_TEXT,
  sustainTemplate: DEFAULT_STAND_SUSTAIN_TEMPLATE,
  releaseTemplate: DEFAULT_STAND_RELEASE_TEMPLATE
};

function toDisplayLabel(itemType: string): string {
  return itemType
    .split('_')
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function parseBoldSegments(text: string): Array<{ text: string; bold: boolean }> {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('**') && segment.endsWith('**')) {
        return { text: segment.slice(2, -2), bold: true };
      }

      return { text: segment, bold: false };
    });
}

function getMemberAndCalling(item: StandProgramItem): { memberName: string; callingName: string } {
  const memberName = item.title?.trim() ? formatAtStandMemberName(item.title, item.member, item.notes ?? undefined) : 'the member';
  const callingName = item.notes?.trim() || toDisplayLabel(item.itemType);
  return { memberName, callingName };
}

function isPersonItem(itemType: string): boolean {
  return ['PRESIDING', 'CONDUCTING', 'INVOCATION', 'SPEAKER', 'BENEDICTION'].includes(itemType.toUpperCase());
}

function renderTemplateLine(template: string, values: { memberName: string; callingName: string }) {
  const message = template.replaceAll('{memberName}', values.memberName).replaceAll('{callingName}', values.callingName);
  return {
    segments: parseBoldSegments(message),
    summary: `${values.memberName} — ${values.callingName}`
  };
}

export type StandAnnouncementItem = {
  title: string;
  body: string | null;
  includeInStand?: boolean;
};

export function buildStandRows(
  items: StandProgramItem[],
  templateOverrides?: Partial<StandTemplate>,
  announcements?: StandAnnouncementItem[]
): StandRow[] {
  const template: StandTemplate = {
    welcomeText: templateOverrides?.welcomeText ?? DEFAULT_TEMPLATE.welcomeText,
    sustainTemplate: templateOverrides?.sustainTemplate ?? DEFAULT_TEMPLATE.sustainTemplate,
    releaseTemplate: templateOverrides?.releaseTemplate ?? DEFAULT_TEMPLATE.releaseTemplate
  };

  const rows: StandRow[] = [{ kind: 'welcome', text: template.welcomeText }];

  const standAnnouncements = announcements?.filter((a) => a.includeInStand !== false) ?? [];

  for (const item of items) {
    const normalizedType = item.itemType.toUpperCase();
    const label = toDisplayLabel(normalizedType);

    if (normalizedType.includes('SUSTAIN')) {
      const values = getMemberAndCalling(item);
      rows.push({
        kind: 'sustain',
        programItemId: item.id,
        ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {}),
        ...renderTemplateLine(template.sustainTemplate, values)
      });
      continue;
    }

    if (normalizedType.includes('RELEASE')) {
      const values = getMemberAndCalling(item);
      rows.push({
        kind: 'release',
        programItemId: item.id,
        ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {}),
        ...renderTemplateLine(template.releaseTemplate, values)
      });
      continue;
    }

    if (normalizedType === 'WARD_AND_STAKE_BUSINESS') {
      rows.push({ kind: 'ward_business', programItemId: item.id, ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {}) });
      continue;
    }

    if (normalizedType === 'ANNOUNCEMENT') {
      const details = standAnnouncements.length
        ? standAnnouncements.map((ann) => (ann.body?.trim() ? `${ann.title}: ${ann.body}` : ann.title)).join('\n')
        : 'No announcements marked for At the Stand.';
      rows.push({ kind: 'standard', programItemId: item.id, label, details, ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {}) });
      continue;
    }

    const hymnBits = [item.hymnNumber?.trim(), item.hymnTitle?.trim()].filter(Boolean).join(' — ');
    const details = item.title?.trim()
      ? isPersonItem(normalizedType)
        ? formatAtStandMemberName(item.title, item.member, item.notes ?? undefined)
        : item.title.trim()
      : item.notes?.trim() || hymnBits || label;

    rows.push({ kind: 'standard', programItemId: item.id, label, details, ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {}) });
  }

  return rows;
}
