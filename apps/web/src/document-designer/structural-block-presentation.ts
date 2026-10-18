import { SECTION_HEADING_PRESENTATIONS, SIMPLE_LIST_PRESENTATIONS } from './constants';
import type { SectionHeadingPresentation, SimpleListItem, SimpleListPresentation } from './types';

export function sectionHeadingPresentation(value: unknown): SectionHeadingPresentation {
  return SECTION_HEADING_PRESENTATIONS.includes(value as SectionHeadingPresentation) ? (value as SectionHeadingPresentation) : 'RULE';
}

export function sectionHeadingPresentationClass(value: unknown): string {
  return `document-section-heading--${sectionHeadingPresentation(value).toLowerCase()}`;
}

export function simpleListPresentation(value: unknown): SimpleListPresentation {
  return SIMPLE_LIST_PRESENTATIONS.includes(value as SimpleListPresentation) ? (value as SimpleListPresentation) : 'BULLETS';
}

export function simpleListPresentationClass(value: unknown): string {
  return `document-simple-list--${simpleListPresentation(value).toLowerCase().replaceAll('_', '-')}`;
}

export function orderedSimpleListItems(items: readonly SimpleListItem[]): SimpleListItem[] {
  return [...items].sort((left, right) => left.order - right.order);
}
