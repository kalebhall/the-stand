export const ANNOUNCEMENT_PLACEMENTS = ['PROGRAM_TOP', 'PROGRAM_BOTTOM'] as const;

export type AnnouncementPlacement = (typeof ANNOUNCEMENT_PLACEMENTS)[number];

export type AnnouncementRenderItem = {
  title: string;
  body: string | null;
  startDate: string | null;
  endDate: string | null;
  isPermanent: boolean;
  placement: AnnouncementPlacement;
  includeInProgram?: boolean;
  includeInStand?: boolean;
};

export function isAnnouncementPlacement(value: string): value is AnnouncementPlacement {
  return ANNOUNCEMENT_PLACEMENTS.includes(value as AnnouncementPlacement);
}

export function isAnnouncementActiveForDate(
  announcement: Pick<AnnouncementRenderItem, 'startDate' | 'endDate' | 'isPermanent'>,
  meetingDate: string
): boolean {
  // If explicitly permanent or no dates are specified, it never expires
  if (announcement.isPermanent || (!announcement.startDate && !announcement.endDate)) {
    return true;
  }

  // If start date is in the future, it is not yet active for this meeting date
  if (announcement.startDate && announcement.startDate > meetingDate) {
    return false;
  }

  // If there's an end date, expire once meetingDate is past end date
  if (announcement.endDate) {
    if (announcement.endDate < meetingDate) {
      return false;
    }
  }

  return true;
}
