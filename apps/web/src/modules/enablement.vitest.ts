import { describe, expect, it } from 'vitest';

import { getNavigationItems } from '@/src/auth/navigation';
import { buildConductView, buildPrepView, renderBasicProgram } from '@/src/conducting/core';
import { canonicalizeMeeting, createMeetingContext, transitionMeetingStatus, type Meeting } from '@/src/conducting/model';
import { composeModulePermissions, createModuleEnablement, getEnabledModules, isModuleRouteEnabled } from './enablement';
import { CORE_MODULE_ID, DEFAULT_MODULE_REGISTRY } from './registry';
import { hasModulePermission } from '@/src/platform/permissions';

function createFlowMeeting(): Meeting {
  return canonicalizeMeeting({
    id: 'meeting-1',
    wardId: 'ward-a',
    meetingDate: '2026-10-04',
    meetingType: 'SACRAMENT',
    status: 'DRAFT',
    programItems: [
      {
        itemType: 'INTRODUCTION', title: 'Introduction', notes: '', topic: '', programNotes: '', hymnNumber: '', hymnTitle: '',
        introductionRoles: { presiding: 'Bishop', conducting: 'Counselor', organist: 'Organist', chorister: 'Chorister' }, speakerStatus: null
      },
      {
        itemType: 'SPEAKER', title: 'Sister Hall', notes: '', topic: 'Faith in Jesus Christ', programNotes: '', hymnNumber: '', hymnTitle: '',
        introductionRoles: null, speakerStatus: 'CONFIRMED'
      },
      {
        itemType: 'SACRAMENT', title: '', notes: '', topic: '', programNotes: '', hymnNumber: '', hymnTitle: '',
        introductionRoles: null, speakerStatus: null
      }
    ]
  });
}

describe('module enablement harness', () => {
  it('runs the core prep → conduct → publish flow with every optional module disabled', () => {
    const enablement = createModuleEnablement();
    for (const module of DEFAULT_MODULE_REGISTRY.modules) {
      if (module.id !== CORE_MODULE_ID) enablement.setEnabled('ward-a', module.id, false);
    }

    expect(getEnabledModules('ward-a', enablement).map((module) => module.id)).toEqual([CORE_MODULE_ID]);
    expect(composeModulePermissions('ward-a', enablement)).toEqual([
      'meetings.view', 'meetings.manage', 'conducting.view'
    ]);
    expect(isModuleRouteEnabled('ward-a', '/meetings/meeting-1', enablement)).toBe(true);
    expect(isModuleRouteEnabled('ward-a', '/programs', enablement)).toBe(false);

    const draft = createFlowMeeting();
    const context = createMeetingContext('user-1', 'ward-a', draft);
    expect(buildPrepView(context).readyToPublish).toBe(true);
    expect(buildConductView(context).rows.map((row) => row.kind)).toEqual(['welcome', 'item', 'item', 'sacrament']);

    const published = { ...draft, status: transitionMeetingStatus(draft.status, 'publish') };
    expect(renderBasicProgram(published)).toContain('Faith in Jesus Christ');
  });

  it('isolates enablement between Ward A and Ward B', () => {
    const enablement = createModuleEnablement();
    enablement.setEnabled('ward-a', 'programs', false);

    const wardANavigation = getNavigationItems(['STAND_ADMIN'], 'ward-a', enablement);
    const wardBNavigation = getNavigationItems(['STAND_ADMIN'], 'ward-b', enablement);

    expect(wardANavigation).not.toContainEqual({ href: '/programs', label: 'Programs' });
    expect(wardBNavigation).toContainEqual({ href: '/programs', label: 'Programs' });
    expect(hasModulePermission({ activeWardId: 'ward-a' }, 'ward-a', 'programs.view', enablement)).toBe(false);
    expect(hasModulePermission({ activeWardId: 'ward-b', roles: ['STAND_ADMIN'] }, 'ward-b', 'programs.view', enablement)).toBe(true);
    expect(hasModulePermission({ activeWardId: 'ward-b' }, 'ward-a', 'programs.view', enablement)).toBe(false);
    expect(hasModulePermission({ activeWardId: 'ward-b', roles: ['CONDUCTOR_VIEW'] }, 'ward-b', 'programs.view', enablement)).toBe(false);
    expect(hasModulePermission({ activeWardId: 'ward-b', roles: ['STAND_ADMIN'] }, 'ward-b', 'programs.view', enablement)).toBe(true);
    expect(hasModulePermission({ activeWardId: 'ward-b', roles: ['STAND_ADMIN'] }, 'ward-b', 'support.manage', enablement)).toBe(false);
    expect(hasModulePermission({ activeWardId: 'ward-b', roles: ['STAKE_ADMIN'] }, 'ward-b', 'programs.templates.manage', enablement)).toBe(true);
    expect(hasModulePermission({ activeWardId: 'ward-b', roles: ['SUPPORT_ADMIN'] }, 'ward-b', 'programs.templates.manage', enablement)).toBe(true);

    enablement.setEnabled('ward-b', 'technology-checklist', false);
    expect(hasModulePermission({ activeWardId: 'ward-b', roles: ['STAND_ADMIN'] }, 'ward-b', 'technology-checklist.manage', enablement)).toBe(false);
    enablement.setEnabled('ward-b', 'technology-checklist', true);
    expect(hasModulePermission({ activeWardId: 'ward-b', roles: ['STAND_ADMIN'] }, 'ward-b', 'technology-checklist.manage', enablement)).toBe(true);
  });
});
