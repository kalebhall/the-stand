import { describe, expect, it } from 'vitest';

import { createModuleEnablement } from '@/src/modules/enablement';
import { getDashboardModuleVisibility } from './visibility';

describe('dashboard module visibility', () => {
  it('hides optional dashboard cards when their modules are disabled', () => {
    const enablement = createModuleEnablement({
      ward: {
        'membership-ordinances': false,
        callings: false,
        notifications: false,
        imports: false,
        bishopric: false,
        leadership: false,
        'technology-checklist': false,
        support: false
      }
    });

    expect(getDashboardModuleVisibility('ward', enablement, true, true, true, true)).toEqual({
      meetings: true,
      membership: false,
      callings: false,
      notifications: false,
      imports: false,
      bishopric: false,
      leadership: false,
      technology: false,
      support: false
    });
  });

  it('does not expose a disabled module through a role alone', () => {
    const enablement = createModuleEnablement({ ward: { callings: false, notifications: false, imports: false } });

    const visibility = getDashboardModuleVisibility('ward', enablement, true, true, true, false);

    expect(visibility.callings).toBe(false);
    expect(visibility.notifications).toBe(false);
    expect(visibility.imports).toBe(false);
  });
});
