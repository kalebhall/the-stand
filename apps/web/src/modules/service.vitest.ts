import { describe, expect, it } from 'vitest';

import { CORE_MODULE_ID, DEFAULT_MODULE_REGISTRY } from './registry';
import { buildEffectiveModuleSettings, validateModuleChange } from './service';

describe('module enablement policy', () => {
  it('uses registry defaults when a ward has no override', () => {
    const settings = buildEffectiveModuleSettings(DEFAULT_MODULE_REGISTRY, new Map());
    expect(settings.find((module) => module.id === 'technology-checklist')).toMatchObject({
      enabled: false,
      overridden: false,
      description: 'Prepare and track meeting technology checks before the ward gathers.'
    });
  });

  it('keeps only Conducting Core enabled by default and describes every module', () => {
    const settings = buildEffectiveModuleSettings(DEFAULT_MODULE_REGISTRY, new Map());

    expect(settings.filter((module) => module.enabled).map((module) => module.id)).toEqual([CORE_MODULE_ID]);
    expect(settings.every((module) => module.description.trim().length > 0)).toBe(true);
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
