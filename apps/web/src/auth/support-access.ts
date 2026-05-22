export type WardAccessAssignment = {
  wardId: string;
  isSupportAssignment: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function isExpired(expiresAt: string | null, now: Date): boolean {
  return Boolean(expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= now.getTime());
}

export function isWardAssignmentActive(assignment: WardAccessAssignment, now: Date = new Date()): boolean {
  if (assignment.revokedAt) {
    return false;
  }

  return !isExpired(assignment.expiresAt, now);
}

export function isSupportGrantActive(assignment: WardAccessAssignment, now: Date = new Date()): boolean {
  return assignment.isSupportAssignment && isWardAssignmentActive(assignment, now);
}

export function chooseActiveWardId({
  isSupportAdmin,
  assignments,
  now = new Date()
}: {
  isSupportAdmin: boolean;
  assignments: WardAccessAssignment[];
  now?: Date;
}): string | null {
  const activeAssignments = assignments.filter((assignment) => isWardAssignmentActive(assignment, now));

  if (isSupportAdmin) {
    const latestSupportGrant = activeAssignments
      .filter((assignment) => assignment.isSupportAssignment)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];

    if (latestSupportGrant) {
      return latestSupportGrant.wardId;
    }
  }

  const oldestStandardAssignment = activeAssignments
    .filter((assignment) => !assignment.isSupportAssignment)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0];

  if (oldestStandardAssignment) {
    return oldestStandardAssignment.wardId;
  }

  return activeAssignments.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0]?.wardId ?? null;
}
