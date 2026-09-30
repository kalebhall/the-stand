import { describe, expect, it } from 'vitest';

import { getProgramRegistration, hasProgramType, PROGRAM_REGISTRY, validateProgramRegistry } from './registry';

const sacramentRegistration = PROGRAM_REGISTRY[0];

describe('program registry', () => {
  it('registers the sacrament meeting adapter as the initial program type', () => {
    expect(getProgramRegistration('SACRAMENT_PROGRAM')).toBe(sacramentRegistration);
    expect(sacramentRegistration.sourceType).toBe('STAND_MEETING');
    expect(hasProgramType('SACRAMENT_PROGRAM')).toBe(true);
    expect(hasProgramType('FUNERAL_PROGRAM')).toBe(false);
  });

  it('rejects duplicate program types before registration', () => {
    expect(() => validateProgramRegistry([sacramentRegistration, sacramentRegistration])).toThrow(/duplicate program types/);
  });
});
