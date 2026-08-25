import { describe, expect, it } from 'vitest';

import { canTransitionCallingStatus } from './lifecycle';

describe('calling lifecycle', () => {
  it('allows lifecycle transitions plus converting active or completed callings to assigned', () => {
    expect(canTransitionCallingStatus('PROPOSED', 'EXTENDED')).toBe(true);
    expect(canTransitionCallingStatus('EXTENDED', 'SUSTAINED')).toBe(true);
    expect(canTransitionCallingStatus('SUSTAINED', 'SET_APART')).toBe(true);

    expect(canTransitionCallingStatus('PROPOSED', 'ASSIGNED')).toBe(true);
    expect(canTransitionCallingStatus('EXTENDED', 'ASSIGNED')).toBe(true);
    expect(canTransitionCallingStatus('SUSTAINED', 'ASSIGNED')).toBe(true);
    expect(canTransitionCallingStatus('SET_APART', 'ASSIGNED')).toBe(true);

    expect(canTransitionCallingStatus('ASSIGNED', 'PROPOSED')).toBe(false);
    expect(canTransitionCallingStatus('ASSIGNED', 'SET_APART')).toBe(false);
    expect(canTransitionCallingStatus('PROPOSED', 'SUSTAINED')).toBe(false);
    expect(canTransitionCallingStatus('EXTENDED', 'SET_APART')).toBe(false);
    expect(canTransitionCallingStatus('SET_APART', 'PROPOSED')).toBe(false);
  });
});
