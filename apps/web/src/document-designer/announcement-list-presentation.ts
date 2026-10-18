import { ANNOUNCEMENT_LIST_PRESENTATIONS } from './constants';
import type { AnnouncementListItem, AnnouncementListPresentation } from './types';

export function announcementListPresentation(value: unknown): AnnouncementListPresentation {
  return ANNOUNCEMENT_LIST_PRESENTATIONS.includes(value as AnnouncementListPresentation)
    ? (value as AnnouncementListPresentation)
    : 'COMPACT_ROWS';
}

export function announcementListPresentationClass(value: unknown): string {
  return `document-announcement-list--${announcementListPresentation(value).toLowerCase().replaceAll('_', '-')}`;
}

export function orderedAnnouncementItems(items: readonly AnnouncementListItem[]): AnnouncementListItem[] {
  return items.slice().sort((left, right) => left.order - right.order);
}
