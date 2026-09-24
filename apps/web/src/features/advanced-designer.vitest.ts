import { describe, expect, it } from 'vitest';

import { getNavigationItems } from '@/src/auth/navigation';
import { isAdvancedDesignerEnabled } from './advanced-designer';

describe('advanced-designer feature flag', () => {
  it('fails closed when the repository flag is off', () => {
    expect(isAdvancedDesignerEnabled({ repositoryEnabled: false, wardEnabled: true, capabilityEnabled: true })).toBe(false);
    expect(isAdvancedDesignerEnabled({ repositoryEnabled: true, wardEnabled: false, capabilityEnabled: true })).toBe(false);
  });

  it('removes program-designer navigation when disabled', () => {
    const navigation = getNavigationItems(['STAND_ADMIN'], 'ward-a', undefined, undefined, false);
    expect(navigation.some((item) => item.href === '/programs' || item.href.startsWith('/programs/'))).toBe(false);
    expect(navigation).toContainEqual({ href: '/meetings', label: 'Meetings' });
  });
});
