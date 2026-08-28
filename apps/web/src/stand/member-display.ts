const LEADERSHIP_TITLES = new Set(['bishop', 'president']);

export type MemberDisplayInfo = {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
};

function cleanNamePart(value: string | null | undefined): string {
  return value?.trim().split(/\s+/)[0] ?? '';
}

function parseName(memberName: string, info?: MemberDisplayInfo): { firstName: string; lastName: string } {
  const firstName = cleanNamePart(info?.firstName);
  const lastName = cleanNamePart(info?.lastName);
  if (firstName && lastName) return { firstName, lastName };

  const parts = memberName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' };
  if (parts[0].endsWith(',')) return { firstName: parts[1] ?? '', lastName: parts[0].slice(0, -1) };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

export function formatAtStandMemberName(memberName: string, info?: MemberDisplayInfo, callingName?: string): string {
  const { firstName, lastName } = parseName(memberName, info);
  const normalizedCalling = callingName?.toLowerCase() ?? '';
  const title = [...LEADERSHIP_TITLES].find((candidate) => normalizedCalling.includes(candidate));
  const normalizedGender = info?.gender?.toLowerCase();
  const honorific = title
    ? title[0].toUpperCase() + title.slice(1)
    : normalizedGender?.startsWith('f')
      ? 'Sister'
      : normalizedGender?.startsWith('m')
        ? 'Brother'
        : '';
  return [honorific, firstName, lastName].filter(Boolean).join(' ');
}
