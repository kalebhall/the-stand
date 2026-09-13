import { describe, expect, it } from 'vitest';
import { DEFAULT_WARD_FEATURE_FLAGS } from './types';
import { featureIsEnabled } from './flags';

describe('ward feature flags', () => {
  it('defaults every optional workflow on', () => {
    expect(DEFAULT_WARD_FEATURE_FLAGS).toEqual({ BISHOPRIC_AGENDA: true, SCHEDULED_INTERVIEWS: true, TECHNOLOGY_CHECKLIST: true, SPEAKER_LIFECYCLE: true });
  });

  it('checks selected feature without changing other flags', () => {
    const flags = { ...DEFAULT_WARD_FEATURE_FLAGS, TECHNOLOGY_CHECKLIST: false };
    expect(featureIsEnabled(flags, 'TECHNOLOGY_CHECKLIST')).toBe(false);
    expect(featureIsEnabled(flags, 'BISHOPRIC_AGENDA')).toBe(true);
  });
});
