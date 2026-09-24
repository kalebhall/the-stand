export const DASHBOARD_CARD_IDS = [
  'next-meeting',
  'draft-count',
  'membership-follow-up',
  'priesthood-preparation',
  'interview-follow-up',
  'overdue-actions',
  'leadership-due',
  'scheduled-interviews',
  'lcr-follow-up',
  'official-handoff',
  'set-apart-queue',
  'notification-health',
  'last-import',
  'technology-readiness',
  'public-portal',
  'support-user-administration',
  'support-provisioning'
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];

const dashboardCardIdSet = new Set<string>(DASHBOARD_CARD_IDS);

export function normalizeDashboardCardOrder(order: unknown, visibleIds: readonly DashboardCardId[] = DASHBOARD_CARD_IDS): DashboardCardId[] | null {
  if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) return null;
  const visibleSet = new Set(visibleIds);
  const filtered = order.filter((id): id is DashboardCardId => dashboardCardIdSet.has(id) && visibleSet.has(id));
  if (new Set(filtered).size !== filtered.length) return null;
  return [...filtered, ...visibleIds.filter((id) => !filtered.includes(id))];
}

export function isDashboardCardId(value: string): value is DashboardCardId {
  return dashboardCardIdSet.has(value);
}
