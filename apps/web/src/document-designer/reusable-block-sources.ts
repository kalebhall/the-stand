import type { SafeMeetingSource } from './data-resolver';

export const REUSABLE_BLOCK_SOURCE_KEYS = ['MEETING_DATE', 'MEETING_TIME', 'MEETING_TYPE', 'WARD_NAME', 'MEETING_LOCATION'] as const;
export type ReusableBlockSourceKey = (typeof REUSABLE_BLOCK_SOURCE_KEYS)[number];

export type ReusableBlockSourceReference = {
  key: ReusableBlockSourceKey;
  fallbackText?: string;
};

export function resolveReusableBlockSource(reference: ReusableBlockSourceReference, source: SafeMeetingSource): string | null {
  assertReusableBlockSourceReference(reference);
  const value = {
    MEETING_DATE: source.meetingDate,
    MEETING_TIME: source.meetingTime,
    MEETING_TYPE: source.meetingType.replaceAll('_', ' '),
    WARD_NAME: source.wardName,
    MEETING_LOCATION: source.location
  }[reference.key];
  return value ?? reference.fallbackText ?? null;
}

export function assertReusableBlockSourceReference(reference: ReusableBlockSourceReference): void {
  if (!reference || typeof reference !== 'object' || !REUSABLE_BLOCK_SOURCE_KEYS.includes(reference.key)) throw new Error('Unsupported reusable block source');
  if (reference.fallbackText !== undefined && (typeof reference.fallbackText !== 'string' || reference.fallbackText.length > 500)) throw new Error('Reusable block source fallback is invalid');
}
