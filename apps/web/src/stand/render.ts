import { getDefaultStandTemplate } from './default-template';
import { formatAtStandMemberName, type MemberDisplayInfo } from './member-display';
import { buildHymnUrl } from './hymn-links';
import type { IntroductionRoles } from '../meetings/types';

export type StandProgramItem = {
  id: string;
  itemType: string;
  title: string | null;
  member?: MemberDisplayInfo;
  notes: string | null;
  operationalCallingName?: string | null;
  includesStakeBusiness?: boolean;
  topic?: string | null;
  programNotes?: string | null;
  hymnNumber: string | null;
  hymnTitle: string | null;
  hymnLocale?: string | null;
  introductionRoles?: IntroductionRoles | null;
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
      kind: 'sacrament';
      programItemId: string;
      programNotes?: string | null;
    }
  | {
      kind: 'standard';
      programItemId?: string;
      programNotes?: string | null;
      label: string;
      details: string;
      hymnUrl?: string;
    }
  | {
      kind: 'sustain' | 'release';
      programItemId: string;
      programNotes?: string | null;
      segments: Array<{ text: string; bold: boolean }>;
      summary: string;
    }
  | {
      kind: 'ward_business';
      programItemId: string;
      programNotes?: string | null;
      includesStakeBusiness?: boolean;
      stakeBusinessParticipantName?: string | null;
      stakeBusinessParticipantCalling?: string | null;
    };

export type StandRenderLabels = {
  itemLabels: Record<string, string>;
  introduction: string;
  presiding: string;
  conducting: string;
  organistPianist: string;
  chorister: string;
  unassigned: string;
  visitingStakeLeader: string;
  visitingPresidingAuthority?: string;
  visitingHighCouncilor?: string;
  visitingGeneralOfficer?: string;
  visitingOtherLeader?: string;
  defaultTemplates?: StandTemplate;
};

const DEFAULT_RENDER_LABELS: StandRenderLabels = {
  itemLabels: {},
  introduction: 'Introduction',
  presiding: 'Presiding',
  conducting: 'Conducting',
  organistPianist: 'Organist / Pianist',
  chorister: 'Chorister',
  unassigned: 'Unassigned',
  visitingStakeLeader: 'Visiting stake leader',
  visitingPresidingAuthority: 'Presiding authority',
  visitingHighCouncilor: 'Visiting high councilor',
  visitingGeneralOfficer: 'Visiting General Officer',
  visitingOtherLeader: 'Visiting leader'
};

function toDisplayLabel(itemType: string, labels: StandRenderLabels = DEFAULT_RENDER_LABELS): string {
  const normalizedType = itemType.toUpperCase();
  if (labels.itemLabels?.[normalizedType]) return labels.itemLabels[normalizedType];
  if (normalizedType === 'ORGANIST_PIANIST') return labels.organistPianist;

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

function getMemberAndCalling(
  item: StandProgramItem,
  labels: StandRenderLabels = DEFAULT_RENDER_LABELS
): { memberName: string; callingName: string } {
  const callingName = item.operationalCallingName?.trim() || toDisplayLabel(item.itemType, labels);
  const memberName = item.title?.trim() ? formatAtStandMemberName(item.title, item.member, callingName) : 'the member';
  return { memberName, callingName };
}

function isPersonItem(itemType: string): boolean {
  return ['PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER', 'INVOCATION', 'SPEAKER', 'BENEDICTION'].includes(
    itemType.toUpperCase()
  );
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
  announcements?: StandAnnouncementItem[],
  labels: StandRenderLabels = DEFAULT_RENDER_LABELS
): StandRow[] {
  const template: StandTemplate = {
    welcomeText: templateOverrides?.welcomeText ?? labels.defaultTemplates?.welcomeText ?? getDefaultStandTemplate('en-US').welcomeText,
    sustainTemplate:
      templateOverrides?.sustainTemplate ?? labels.defaultTemplates?.sustainTemplate ?? getDefaultStandTemplate('en-US').sustainTemplate,
    releaseTemplate:
      templateOverrides?.releaseTemplate ?? labels.defaultTemplates?.releaseTemplate ?? getDefaultStandTemplate('en-US').releaseTemplate
  };

  const rows: StandRow[] = [{ kind: 'welcome', text: template.welcomeText }];

  const standAnnouncements = announcements?.filter((a) => a.includeInStand !== false) ?? [];

  for (const item of items) {
    const normalizedType = item.itemType.toUpperCase();
    const label = toDisplayLabel(normalizedType, labels);

    if (normalizedType === 'INTRODUCTION') {
      const roles = item.introductionRoles ?? { presiding: '', conducting: '', organist: '', chorister: '' };
      const details = [
        [labels.presiding, roles.presiding],
        [labels.conducting, roles.conducting],
        [labels.organistPianist, roles.organist],
        [labels.chorister, roles.chorister]
      ]
        .map(([role, name]) => `${role}: ${name || labels.unassigned}`)
        .concat(
          (roles.visitingLeaders ?? []).map((leader) => {
            const typeLabel =
              leader.recognitionType === 'PRESIDING_AUTHORITY'
                ? (labels.visitingPresidingAuthority ?? labels.visitingStakeLeader)
                : leader.recognitionType === 'HIGH_COUNCILOR'
                  ? (labels.visitingHighCouncilor ?? labels.visitingStakeLeader)
                  : leader.recognitionType === 'GENERAL_OFFICER'
                    ? (labels.visitingGeneralOfficer ?? labels.visitingStakeLeader)
                    : (labels.visitingOtherLeader ?? labels.visitingStakeLeader);
            return `${typeLabel}: ${leader.name || labels.unassigned}${leader.calling ? ` (${leader.calling})` : ''}`;
          })
        )
        .join('\n');
      rows.push({
        kind: 'standard',
        programItemId: item.id,
        label: labels.introduction,
        details,
        ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {})
      });
      continue;
    }

    if (normalizedType.includes('SUSTAIN')) {
      const values = getMemberAndCalling(item, labels);
      rows.push({
        kind: 'sustain',
        programItemId: item.id,
        ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {}),
        ...renderTemplateLine(template.sustainTemplate, values)
      });
      continue;
    }

    if (normalizedType.includes('RELEASE')) {
      const values = getMemberAndCalling(item, labels);
      rows.push({
        kind: 'release',
        programItemId: item.id,
        ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {}),
        ...renderTemplateLine(template.releaseTemplate, values)
      });
      continue;
    }

    if (normalizedType === 'WARD_AND_STAKE_BUSINESS') {
      rows.push({
        kind: 'ward_business',
        programItemId: item.id,
        includesStakeBusiness: item.includesStakeBusiness ?? item.notes?.includes('[STAKE_BUSINESS]') ?? false,
        stakeBusinessParticipantName: item.title?.trim() || null,
        stakeBusinessParticipantCalling: item.topic?.trim() || null,
        ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {})
      });
      continue;
    }

    if (normalizedType === 'SACRAMENT') {
      rows.push({ kind: 'sacrament', programItemId: item.id, ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {}) });
      continue;
    }

    if (normalizedType === 'ANNOUNCEMENT') {
      if (!standAnnouncements.length) continue;
      const details = standAnnouncements.map((ann) => (ann.body?.trim() ? `${ann.title}: ${ann.body}` : ann.title)).join('\n');
      rows.push({
        kind: 'standard',
        programItemId: item.id,
        label,
        details,
        ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {})
      });
      continue;
    }

    const hymnBits = [item.hymnNumber?.trim(), item.hymnTitle?.trim()].filter(Boolean).join(' — ');
    const isHymn = normalizedType.includes('HYMN');
    const details = item.title?.trim()
      ? isPersonItem(normalizedType)
        ? [
            formatAtStandMemberName(item.title, item.member, item.notes ?? undefined),
            normalizedType === 'SPEAKER' ? item.topic?.trim() : null
          ]
            .filter(Boolean)
            .join('\n')
        : item.title.trim()
      : item.notes?.trim() || hymnBits || label;

    rows.push({
      kind: 'standard',
      programItemId: item.id,
      label,
      details,
      ...(isHymn ? { hymnUrl: buildHymnUrl(item.hymnNumber, item.hymnTitle, item.hymnLocale ?? 'en-US') ?? undefined } : {}),
      ...(item.programNotes?.trim() ? { programNotes: item.programNotes } : {})
    });
  }

  return rows;
}
