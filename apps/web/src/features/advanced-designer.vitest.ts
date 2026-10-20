import { describe, expect, it } from 'vitest';

import { getNavigationItems } from '@/src/auth/navigation';
import { isAdvancedDesignerFeatureEnabled } from './advanced-designer';

describe('advanced-designer feature flag', () => {
  it('keeps advanced mode enabled by default and honors the global emergency switch', () => {
    const priorPublic = process.env.NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED;
    const priorServer = process.env.ADVANCED_DESIGNER_ENABLED;
    delete process.env.NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED;
    delete process.env.ADVANCED_DESIGNER_ENABLED;
    expect(isAdvancedDesignerFeatureEnabled()).toBe(true);
    process.env.ADVANCED_DESIGNER_ENABLED = 'false';
    expect(isAdvancedDesignerFeatureEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED = 'true';
    expect(isAdvancedDesignerFeatureEnabled()).toBe(false);
    process.env.ADVANCED_DESIGNER_ENABLED = 'true';
    process.env.NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED = 'false';
    expect(isAdvancedDesignerFeatureEnabled()).toBe(false);
    if (priorPublic === undefined) delete process.env.NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED;
    else process.env.NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED = priorPublic;
    if (priorServer === undefined) delete process.env.ADVANCED_DESIGNER_ENABLED;
    else process.env.ADVANCED_DESIGNER_ENABLED = priorServer;
  });

  it('removes program-designer navigation when disabled', () => {
    const navigation = getNavigationItems(['STAND_ADMIN'], 'ward-a', undefined, undefined, false);
    expect(navigation.some((item) => item.href === '/programs' || item.href.startsWith('/programs/'))).toBe(false);
    expect(navigation).toContainEqual({ href: '/meetings', label: 'Meetings' });
  });
});
