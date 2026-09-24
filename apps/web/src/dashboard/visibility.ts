import type { ModuleEnablement } from '@/src/modules/types';

export type DashboardModuleVisibility = {
  meetings: boolean;
  membership: boolean;
  callings: boolean;
  notifications: boolean;
  imports: boolean;
  bishopric: boolean;
  leadership: boolean;
  technology: boolean;
  support: boolean;
};

export function getDashboardModuleVisibility(
  wardId: string,
  enablement: ModuleEnablement,
  canViewMeetings: boolean,
  canViewCallings: boolean,
  canViewTechnology: boolean,
  canViewSupport: boolean
): DashboardModuleVisibility {
  return {
    meetings: canViewMeetings && enablement.isEnabled(wardId, 'conducting-core'),
    membership: canViewMeetings && enablement.isEnabled(wardId, 'membership-ordinances'),
    callings: canViewCallings && enablement.isEnabled(wardId, 'callings'),
    notifications: canViewCallings && enablement.isEnabled(wardId, 'notifications'),
    imports: canViewCallings && enablement.isEnabled(wardId, 'imports'),
    bishopric: canViewMeetings && enablement.isEnabled(wardId, 'bishopric'),
    leadership: canViewMeetings && enablement.isEnabled(wardId, 'leadership'),
    technology: canViewTechnology && enablement.isEnabled(wardId, 'technology-checklist'),
    support: canViewSupport && enablement.isEnabled(wardId, 'support')
  };
}
