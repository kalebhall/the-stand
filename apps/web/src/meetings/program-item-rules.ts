export type ProtectedOrderError = {
  code: 'INVALID_PROTECTED_ORDER';
  reason:
    | 'NON_CONTIGUOUS_SEQUENCE'
    | 'DUPLICATE_SEQUENCE'
    | 'INTRODUCTION_POSITION'
    | 'ANNOUNCEMENT_POSITION'
    | 'CONFERENCE_INTRODUCTION'
    | 'MISSING_ANNOUNCEMENT';
};

export function validateProtectedProgramOrder(
  meetingType: string,
  orderedItems: ReadonlyArray<{ itemType: string; sequence: number }>
): ProtectedOrderError | null {
  const sorted = orderedItems.slice().sort((a, b) => a.sequence - b.sequence);
  const sequences = sorted.map((item) => item.sequence);
  if (sequences.some((sequence, index) => sequence !== index + 1))
    return { code: 'INVALID_PROTECTED_ORDER', reason: 'NON_CONTIGUOUS_SEQUENCE' };
  if (new Set(sequences).size !== sequences.length) return { code: 'INVALID_PROTECTED_ORDER', reason: 'DUPLICATE_SEQUENCE' };

  const introductionTypes = new Set(['INTRODUCTION', 'PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER']);
  const legacyIntroductionOrder = ['PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER'];
  const normalizedTypes = sorted.map((item) => item.itemType.toUpperCase());
  const legacyTypes = normalizedTypes.filter((itemType) => legacyIntroductionOrder.includes(itemType));
  if (normalizedTypes.includes('INTRODUCTION') && legacyTypes.length > 0)
    return { code: 'INVALID_PROTECTED_ORDER', reason: 'INTRODUCTION_POSITION' };
  if (
    new Set(legacyTypes).size !== legacyTypes.length ||
    legacyTypes.some(
      (itemType, index) =>
        legacyIntroductionOrder.indexOf(itemType) !== legacyIntroductionOrder.indexOf(legacyTypes[index - 1] ?? itemType) + 1 && index > 0
    )
  )
    return { code: 'INVALID_PROTECTED_ORDER', reason: 'INTRODUCTION_POSITION' };
  const introductionIndexes = sorted
    .map((item, index) => (introductionTypes.has(item.itemType.toUpperCase()) ? index : -1))
    .filter((index) => index >= 0);
  const announcementIndexes = sorted
    .map((item, index) => (item.itemType.toUpperCase() === 'ANNOUNCEMENT' ? index : -1))
    .filter((index) => index >= 0);
  const conference = meetingType === 'STAKE_CONFERENCE' || meetingType === 'GENERAL_CONFERENCE';

  if (conference && introductionIndexes.length > 0) return { code: 'INVALID_PROTECTED_ORDER', reason: 'CONFERENCE_INTRODUCTION' };
  if (!conference && normalizedTypes.filter((itemType) => itemType === 'INTRODUCTION').length > 1)
    return { code: 'INVALID_PROTECTED_ORDER', reason: 'INTRODUCTION_POSITION' };
  if (!conference && introductionIndexes.length === 0) return { code: 'INVALID_PROTECTED_ORDER', reason: 'INTRODUCTION_POSITION' };
  if (!conference && introductionIndexes[0] !== 0) return { code: 'INVALID_PROTECTED_ORDER', reason: 'INTRODUCTION_POSITION' };
  if (!conference && introductionIndexes.some((index, position) => index !== position))
    return { code: 'INVALID_PROTECTED_ORDER', reason: 'INTRODUCTION_POSITION' };
  if (announcementIndexes.length !== 1) return { code: 'INVALID_PROTECTED_ORDER', reason: 'MISSING_ANNOUNCEMENT' };
  if (announcementIndexes[0] !== (conference ? 0 : introductionIndexes.length))
    return { code: 'INVALID_PROTECTED_ORDER', reason: 'ANNOUNCEMENT_POSITION' };
  return null;
}
