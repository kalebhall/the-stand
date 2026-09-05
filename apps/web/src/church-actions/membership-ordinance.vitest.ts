import { describe, expect, it } from 'vitest';

import { getMembershipOrdinanceGroup, getMembershipOrdinanceNextStep, matchesMembershipOrdinanceFilters, type MembershipOrdinanceActionRow } from './membership-ordinance';

const baseAction: MembershipOrdinanceActionRow = {
  id: 'action-1',
  meetingId: 'meeting-1',
  meetingDate: '2026-09-20',
  meetingType: 'SACRAMENT',
  memberName: 'Jane Doe',
  actionType: 'PRIESTHOOD_ORDINATION',
  status: 'pending',
  plannedDate: '2026-09-20',
  responsibleLeader: 'Bishop Hall',
  interviewStatus: 'completed',
  lcrFollowUpStatus: 'needed'
};

describe('membership ordinance workspace helpers', () => {
  it('groups completed actions with pending LCR work as needing attention', () => {
    expect(getMembershipOrdinanceGroup({ ...baseAction, status: 'completed' }, '2026-09-04')).toBe('needs_attention');
  });

  it('groups future planned actions as upcoming', () => {
    expect(getMembershipOrdinanceGroup({ ...baseAction, lcrFollowUpStatus: 'not_applicable' }, '2026-09-04')).toBe('upcoming');
  });

  it('groups overdue incomplete actions as needing attention', () => {
    expect(getMembershipOrdinanceGroup({ ...baseAction, lcrFollowUpStatus: 'not_applicable', plannedDate: '2026-08-30' }, '2026-09-04')).toBe(
      'needs_attention'
    );
  });

  it('filters by queue, action type, status, and text query', () => {
    expect(matchesMembershipOrdinanceFilters({ ...baseAction, lcrFollowUpStatus: 'not_applicable' }, { group: 'upcoming', actionType: 'PRIESTHOOD_ORDINATION', status: 'pending', query: 'jane' }, '2026-09-04')).toBe(true);
    expect(matchesMembershipOrdinanceFilters(baseAction, { group: 'completed' }, '2026-09-04')).toBe(false);
    expect(matchesMembershipOrdinanceFilters(baseAction, { query: 'relief society' }, '2026-09-04')).toBe(false);
    expect(matchesMembershipOrdinanceFilters({ ...baseAction, status: 'completed' }, { followup: 'lcr' }, '2026-09-04')).toBe(true);
    expect(matchesMembershipOrdinanceFilters({ ...baseAction, lcrFollowUpStatus: 'not_applicable', plannedDate: '2026-08-30' }, { followup: 'overdue' }, '2026-09-04')).toBe(true);
    expect(matchesMembershipOrdinanceFilters({ ...baseAction, interviewStatus: 'not_required' }, { followup: 'interview' }, '2026-09-04')).toBe(false);
  });
  it('returns the most important next step', () => {
    expect(getMembershipOrdinanceNextStep(baseAction)).toBe('Update LCR');
    expect(getMembershipOrdinanceNextStep({ ...baseAction, lcrFollowUpStatus: 'not_applicable', status: 'action_needed' })).toBe('Complete action');
  });
});
