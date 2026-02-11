import { describe, expect, it } from 'vitest';

import { canTransitionCallingStatus } from './lifecycle';

describe('calling lifecycle', () => {
  it('allows only proposed -> extended -> sustained -> set apart transitions', () => {
    expect(canTransitionCallingStatus('PROPOSED', 'EXTENDED')).toBe(true);
    expect(canTransitionCallingStatus('EXTENDED', 'SUSTAINED')).toBe(true);
    expect(canTransitionCallingStatus('SUSTAINED', 'SET_APART')).toBe(true);

    expect(canTransitionCallingStatus('PROPOSED', 'SUSTAINED')).toBe(false);
    expect(canTransitionCallingStatus('EXTENDED', 'SET_APART')).toBe(false);
    expect(canTransitionCallingStatus('SET_APART', 'PROPOSED')).toBe(false);
  });
});
