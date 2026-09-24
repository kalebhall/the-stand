import { describe, expect, it } from 'vitest';

import { CORE_MODULE_ID, DEFAULT_MODULE_REGISTRY } from './registry';
import { buildEffectiveModuleSettings, validateModuleChange } from './service';

describe('module enablement policy', () => {
  it('uses registry defaults when a ward has no override', () => {
    const settings = buildEffectiveModuleSettings(DEFAULT_MODULE_REGISTRY, new Map());
    expect(settings.find((module) => module.id === 'technology-checklist')).toMatchObject({ enabled: true, overridden: false });
  });

  it('applies only the target ward override supplied to the resolver', () => {
    const settings = buildEffectiveModuleSettings(DEFAULT_MODULE_REGISTRY, new Map([['technology-checklist', false]]));
    expect(settings.find((module) => module.id === 'technology-checklist')).toMatchObject({ enabled: false, overridden: true });
  });

  it('rejects unknown modules and disabling Core', () => {
    expect(() => validateModuleChange(DEFAULT_MODULE_REGISTRY, 'missing-module', false)).toThrow('Unknown module');
    expect(() => validateModuleChange(DEFAULT_MODULE_REGISTRY, CORE_MODULE_ID, false)).toThrow('Conducting Core cannot be disabled');
  });
});
