export const DEFAULT_TECHNOLOGY_REMINDER_HORIZON_DAYS = 7;

export function getTechnologyReminderEndDate(now: Date, horizonDays = DEFAULT_TECHNOLOGY_REMINDER_HORIZON_DAYS): Date {
  if (!Number.isInteger(horizonDays) || horizonDays <= 0 || horizonDays > 31) {
    throw new Error('Technology reminder horizon must be an integer between 1 and 31 days.');
  }
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + horizonDays);
  return end;
}
