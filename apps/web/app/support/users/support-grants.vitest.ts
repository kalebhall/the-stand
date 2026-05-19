import { describe, expect, it } from 'vitest';

import { getSupportAccessState, type SupportAwareWardAssignment } from './support-grants';

describe('getSupportAccessState', () => {
  it('allows temporary support grants only for support admins', () => {
    const result = getSupportAccessState({
      user: { global_roles: ['SUPPORT_ADMIN'] },
      assignments: []
    });

    expect(result.canGrantSupportAccess).toBe(true);
    expect(result.standardAssignments).toEqual([]);
    expect(result.supportAssignments).toEqual([]);
  });

  it('separates support grants from permanent ward assignments', () => {
    const assignments: SupportAwareWardAssignment[] = [
      {
        user_id: 'user-1',
        ward_id: 'ward-a',
        ward_name: 'Ward A',
        role_id: 'role-a',
        role_name: 'Ward Clerk',
        is_support_assignment: false,
        grant_reason: null,
        expires_at: null,
        created_at: '2026-05-18T12:00:00.000Z'
      },
      {
        user_id: 'user-1',
        ward_id: 'ward-b',
        ward_name: 'Ward B',
        role_id: 'role-b',
        role_name: 'Ward Leader',
        is_support_assignment: true,
        grant_reason: 'Troubleshoot callings sync',
        expires_at: '2026-05-19T12:00:00.000Z',
        created_at: '2026-05-18T13:00:00.000Z'
      }
    ];

    const result = getSupportAccessState({
      user: { global_roles: ['SUPPORT_ADMIN'] },
      assignments
    });

    expect(result.standardAssignments).toEqual([assignments[0]]);
    expect(result.supportAssignments).toEqual([assignments[1]]);
  });
});
