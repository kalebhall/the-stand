export type ParsedCalendarEvent = {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  tags: string[];
  sourceUpdatedAt: string | null;
};

function unfoldLines(ics: string): string[] {
  const normalized = ics.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');
  const lines: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  return lines;
}

function parseIcsDate(value: string): { iso: string; allDay: boolean } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{8}$/.test(trimmed)) {
    const yyyy = Number(trimmed.slice(0, 4));
    const mm = Number(trimmed.slice(4, 6));
    const dd = Number(trimmed.slice(6, 8));
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    return { iso: date.toISOString(), allDay: true };
  }

  if (/^\d{8}T\d{6}Z$/.test(trimmed)) {
    const yyyy = Number(trimmed.slice(0, 4));
    const mm = Number(trimmed.slice(4, 6));
    const dd = Number(trimmed.slice(6, 8));
    const hh = Number(trimmed.slice(9, 11));
    const min = Number(trimmed.slice(11, 13));
    const sec = Number(trimmed.slice(13, 15));
    const date = new Date(Date.UTC(yyyy, mm - 1, dd, hh, min, sec));
    return { iso: date.toISOString(), allDay: false };
  }

  const maybeDate = new Date(trimmed);
  if (Number.isNaN(maybeDate.valueOf())) {
    return null;
  }

  return { iso: maybeDate.toISOString(), allDay: false };
}

function decodeIcsText(value: string): string {
  return value
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/gi, '\n')
    .replace(/\\\\/g, '\\')
    .trim();
}

export function parseIcsEvents(ics: string): ParsedCalendarEvent[] {
  const lines = unfoldLines(ics);
  const events: ParsedCalendarEvent[] = [];

  let inEvent = false;
  let current: Record<string, string[]> = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }

    if (line === 'END:VEVENT' && inEvent) {
      const uid = current.UID?.[0]?.trim();
      const summary = current.SUMMARY?.[0] ? decodeIcsText(current.SUMMARY[0]) : '';
      const dtStart = current.DTSTART?.[0] ?? null;
      const dtEnd = current.DTEND?.[0] ?? null;
      const parsedStart = dtStart ? parseIcsDate(dtStart) : null;
      const parsedEnd = dtEnd ? parseIcsDate(dtEnd) : null;
      const categories = current.CATEGORIES?.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean) ?? [];

      if (uid && summary && parsedStart) {
        events.push({
          uid,
          title: summary,
          description: current.DESCRIPTION?.[0] ? decodeIcsText(current.DESCRIPTION[0]) : null,
          location: current.LOCATION?.[0] ? decodeIcsText(current.LOCATION[0]) : null,
          startsAt: parsedStart.iso,
          endsAt: parsedEnd?.iso ?? null,
          allDay: parsedStart.allDay,
          tags: categories,
          sourceUpdatedAt: parseIcsDate(current.LAST_MODIFIED?.[0] ?? '')?.iso ?? null
        });
      }

      inEvent = false;
      current = {};
      continue;
    }

    if (!inEvent || !line.includes(':')) {
      continue;
    }

    const separator = line.indexOf(':');
    const rawKey = line.slice(0, separator).toUpperCase();
    const value = line.slice(separator + 1);

    const key = rawKey.startsWith('DTSTART') ? 'DTSTART' : rawKey.startsWith('DTEND') ? 'DTEND' : rawKey;
    current[key] = [...(current[key] ?? []), value];
  }

  return events;
}
