export const INTERVIEW_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export function validateInterviewStatusChange(current: InterviewStatus, next: InterviewStatus): string | null {
  if (current === 'CANCELLED' && next !== 'CANCELLED') return 'Cancelled interviews cannot be reopened.';
  if (current === 'COMPLETED' && next === 'SCHEDULED') return 'Completed interviews cannot return to scheduled.';
  return null;
}

export function isInterviewDue(scheduledAt: string, status: InterviewStatus, now: Date): boolean {
  return status === 'SCHEDULED' && new Date(scheduledAt).getTime() < now.getTime();
}
