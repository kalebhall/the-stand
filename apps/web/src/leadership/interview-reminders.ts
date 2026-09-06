export const DEFAULT_INTERVIEW_REMINDER_HORIZON_HOURS = 24;

export type InterviewReminderWindow = {
  startsAt: Date;
  endsAt: Date;
};

export function getInterviewReminderWindow(
  now: Date,
  horizonHours = DEFAULT_INTERVIEW_REMINDER_HORIZON_HOURS
): InterviewReminderWindow {
  if (!Number.isFinite(horizonHours) || horizonHours <= 0 || horizonHours > 168) {
    throw new Error('Interview reminder horizon must be between 0 and 168 hours.');
  }

  return {
    startsAt: now,
    endsAt: new Date(now.getTime() + horizonHours * 60 * 60 * 1000)
  };
}

export function isInterviewWithinReminderWindow(
  scheduledAt: string | Date,
  status: string,
  window: InterviewReminderWindow
): boolean {
  const timestamp = new Date(scheduledAt).getTime();
  return status === 'SCHEDULED' && timestamp >= window.startsAt.getTime() && timestamp <= window.endsAt.getTime();
}
