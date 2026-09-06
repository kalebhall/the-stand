export type InterviewCalendarEvent = {
  id: string;
  interviewType: string;
  memberName: string;
  interviewerName: string;
  scheduledAt: string;
};

function escapeIcsText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
}

function formatIcsDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error('Invalid interview date');
  return date.toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
}

export function renderInterviewCalendar(events: InterviewCalendarEvent[], now = new Date()): string {
  const stamp = formatIcsDate(now.toISOString());
  const body = events.map((event) => {
    const start = formatIcsDate(event.scheduledAt);
    const end = new Date(new Date(event.scheduledAt).valueOf() + 30 * 60 * 1000).toISOString();
    return [
      'BEGIN:VEVENT',
      `UID:the-stand-interview-${escapeIcsText(event.id)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(`Interview: ${event.interviewType}`)}`,
      `DESCRIPTION:${escapeIcsText(`Member: ${event.memberName}\\nInterviewer: ${event.interviewerName}`)}`,
      'END:VEVENT'
    ].join('\r\n');
  });

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Stand//Interview Schedule//EN', ...body, 'END:VCALENDAR', ''].join('\r\n');
}
