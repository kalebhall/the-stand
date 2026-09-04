export type SupportAwareUser = {
  global_roles: string[] | null;
};

export type SupportAwareWardAssignment = {
  user_id: string;
  ward_id: string;
  ward_name: string;
  role_id: string;
  role_name: string;
  is_support_assignment?: boolean;
  grant_reason?: string | null;
  expires_at?: string | null;
  created_at?: string;
};

export function getSupportAccessState({ user, assignments }: { user: SupportAwareUser; assignments: SupportAwareWardAssignment[] }) {
  const supportAssignments: SupportAwareWardAssignment[] = [];
  const standardAssignments: SupportAwareWardAssignment[] = [];

  for (const assignment of assignments) {
    if (assignment.is_support_assignment) {
      supportAssignments.push(assignment);
    } else {
      standardAssignments.push(assignment);
    }
  }

  return {
    canGrantSupportAccess: Boolean(user.global_roles?.includes('SUPPORT_ADMIN')),
    supportAssignments,
    standardAssignments
  };
}
