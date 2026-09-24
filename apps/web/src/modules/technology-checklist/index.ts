import type { CoreEvent } from '@/src/platform/events/core';
import type { ModuleDefinition } from '../types';

export const TECHNOLOGY_CHECKLIST_MODULE_ID = 'technology-checklist';
export const TECHNOLOGY_CHECKLIST_PERMISSIONS = ['technology-checklist.view', 'technology-checklist.manage'] as const;

export type TechnologyChecklistEvent = Extract<CoreEvent, { type: 'MeetingCreated' | 'MeetingCompleted' }>;

/**
 * Module-owned event boundary. The checklist deliberately does not import Core
 * services; it consumes the versioned event contract only.
 */
export function handleMeetingCreated(event: Extract<TechnologyChecklistEvent, { type: 'MeetingCreated' }>): void {
  // Persistence remains owned by the existing checklist route/table adapter.
  // This subscription is the stable seam for future reminder/checklist actions.
  void event;
}

export function handleMeetingCompleted(event: Extract<TechnologyChecklistEvent, { type: 'MeetingCompleted' }>): void {
  void event;
}

export const technologyChecklistModule: ModuleDefinition = {
  id: TECHNOLOGY_CHECKLIST_MODULE_ID,
  name: 'Technology Checklist',
  version: '1.0.0',
  defaultEnabled: true,
  navigation: [{ href: '/technology', label: 'Technology Checklist' }],
  routes: ['/technology'],
  permissions: [...TECHNOLOGY_CHECKLIST_PERMISSIONS],
  eventHandlers: [
    (event) => { if (event.type === 'MeetingCreated') handleMeetingCreated(event); },
    (event) => { if (event.type === 'MeetingCompleted') handleMeetingCompleted(event); }
  ]
};