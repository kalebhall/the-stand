import { describe, expect, it } from 'vitest';

import { canTransitionFollowUp, getAllowedFollowUpTransitions, requiresInterview, requiresLcrFollowUp } from './types';

describe('church action follow-up model', () => {
  it('allows planned priesthood preparation to move through interview and scheduling', () => {
    expect(canTransitionFollowUp('PLANNED', 'INTERVIEW_NEEDED')).toBe(true);
    expect(canTransitionFollowUp('INTERVIEW_NEEDED', 'INTERVIEW_COMPLETE')).toBe(true);
    expect(canTransitionFollowUp('INTERVIEW_COMPLETE', 'SCHEDULED')).toBe(true);
    expect(canTransitionFollowUp('SCHEDULED', 'ACTION_NEEDED')).toBe(true);
    expect(canTransitionFollowUp('ACTION_NEEDED', 'COMPLETED')).toBe(true);
  });

  it('does not give priesthood actions calling release or sustain transitions', () => {
    expect(getAllowedFollowUpTransitions('COMPLETED')).toEqual([]);
    expect(canTransitionFollowUp('COMPLETED', 'ACTION_NEEDED')).toBe(false);
    expect(canTransitionFollowUp('PLANNED', 'ANNOUNCED')).toBe(false);
  });

  it('requires interviews and LCR follow-up for priesthood actions only', () => {
    expect(requiresInterview('PRIESTHOOD', 'PRIESTHOOD_ORDINATION')).toBe(true);
    expect(requiresLcrFollowUp('PRIESTHOOD', 'PRIESTHOOD_ADVANCEMENT')).toBe(true);
    expect(requiresInterview('MEMBERSHIP', 'BABY_BLESSING')).toBe(false);
    expect(requiresLcrFollowUp('MEMBERSHIP', 'WELCOME_NEW_MEMBER')).toBe(false);
  });
});
