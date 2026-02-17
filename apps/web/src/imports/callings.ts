export type ParsedCalling = {
  memberName: string;
  birthday: string;
  organization: string;
  callingName: string;
  sustained: boolean;
  setApart: boolean;
};

const HEADER_LINE_PATTERN = /^name\s+gender\s+age\s+birth\s+date\s+organization\s+calling\s+sustained\s+set\s+apart$/i;

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === 'set apart';
}

function parseCallingLine(line: string): ParsedCalling | null {
  const normalizedLine = normalizeWhitespace(line);
  if (!normalizedLine) {
    return null;
  }

  if (HEADER_LINE_PATTERN.test(normalizedLine) || /members\s+with\s+callings/i.test(normalizedLine)) {
    return null;
  }

  if (/^count\b/i.test(normalizedLine) || /^total\b/i.test(normalizedLine)) {
    return null;
  }

  const parts = line
    .trim()
    .split(/\s{2,}/)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0);

  if (parts.length < 8) {
    return null;
  }

  const [memberName, gender, age, birthday, organization, ...rest] = parts;
  if (!memberName || !gender || !age || !birthday || !organization || rest.length < 3) {
    return null;
  }

  const sustainedRaw = rest[rest.length - 2] ?? '';
  const setApartRaw = rest[rest.length - 1] ?? '';
  const callingName = rest.slice(0, -2).join(' ').trim();

  if (!callingName) {
    return null;
  }

  return {
    memberName,
    birthday,
    organization,
    callingName,
    sustained: parseBoolean(sustainedRaw),
    setApart: parseBoolean(setApartRaw)
  };
}

export function parseCallingsPdfText(rawText: string): ParsedCalling[] {
  const normalized = rawText.replace(/\r\n?/g, '\n');
  const deduped = new Map<string, ParsedCalling>();

  for (const line of normalized.split('\n')) {
    const parsed = parseCallingLine(line);
    if (!parsed) {
      continue;
    }

    const key = `${parsed.memberName.toLowerCase()}::${parsed.birthday.toLowerCase()}::${parsed.callingName.toLowerCase()}`;
    deduped.set(key, parsed);
  }

  return Array.from(deduped.values());
}

export function makeMemberBirthdayKey(memberName: string, birthday: string): string {
  return `${memberName.replace(/\s+/g, ' ').trim().toLowerCase()}::${birthday.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}
