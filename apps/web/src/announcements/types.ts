export const ANNOUNCEMENT_PLACEMENTS = ['PROGRAM_TOP', 'PROGRAM_BOTTOM'] as const;

export type AnnouncementPlacement = (typeof ANNOUNCEMENT_PLACEMENTS)[number];

export type AnnouncementRenderItem = {
  title: string;
  body: string | null;
  startDate: string | null;
  endDate: string | null;
  isPermanent: boolean;
  placement: AnnouncementPlacement;
};

export function isAnnouncementPlacement(value: string): value is AnnouncementPlacement {
  return ANNOUNCEMENT_PLACEMENTS.includes(value as AnnouncementPlacement);
}

export function isAnnouncementActiveForDate(
  announcement: Pick<AnnouncementRenderItem, 'startDate' | 'endDate' | 'isPermanent'>,
  meetingDate: string
): boolean {
  if (announcement.isPermanent) {
    return true;
  }

  if (announcement.startDate && announcement.startDate > meetingDate) {
    return false;
  }

  if (announcement.endDate && announcement.endDate < meetingDate) {
    return false;
  }

  return true;
}
