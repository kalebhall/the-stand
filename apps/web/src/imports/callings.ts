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
  const raw = value.trim();
  if (!raw) return false;

  const normalized = raw.toLowerCase();

  // Common checkmarks from PDFs
  if (raw.includes('✔') || raw.includes('✓') || raw.includes('√')) return true;

  // Your "Sustained" column is typically a date like "9 Mar 2025"
  // Heuristic: if it contains a digit, we assume it's a "yes" via date.
  if (/\d/.test(raw)) return true;

  return normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === 'set apart';
}


function parseCallingLine(line: string): ParsedCalling | null {
  const trimmedLine = line.trim();
  if (!trimmedLine) return null;

  // Split by 2+ spaces (PDF text extraction usually aligns columns this way)
  const parts = trimmedLine
    .split(/\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  // We expect at least: Member, Gender, Age, Birthday, Organization, Calling
  // Sustained / Set Apart may be missing (blanks collapse during extraction)
  if (parts.length < 6) return null;

  const memberName = parts[0] || '';
  const gender = parts[1] || '';
  const age = parts[2] || '';
  const birthday = parts[3] || '';
  const organization = parts[4] || '';

  // Everything after organization is "the rest"
  const rest = parts.slice(5);

  // If we have 3+ rest parts, treat last 2 as sustained + setApart
  // If we have 2 rest parts, treat last 1 as sustained, setApart blank
  // If we have 1 rest part, it's just callingName
  let callingName = '';
  let sustained = '';
  let setApart = '';

  if (rest.length >= 3) {
    sustained = rest[rest.length - 2] ?? '';
    setApart = rest[rest.length - 1] ?? '';
    callingName = rest.slice(0, rest.length - 2).join(' ').trim();
  } else if (rest.length === 2) {
    sustained = rest[rest.length - 1] ?? '';
    setApart = '';
    callingName = rest.slice(0, rest.length - 1).join(' ').trim();
  } else {
    callingName = (rest[0] ?? '').trim();
    sustained = '';
    setApart = '';
  }

  // Very light validation (helps wrapped lines not be mis-parsed)
  if (!memberName || (gender !== 'M' && gender !== 'F') || !birthday || !callingName) {
    return null;
  }

  return {
    memberName,
    gender,
    age,
    birthday,
    organization,
    callingName,
    sustained: parseBoolean(sustained),
    setApart: parseBoolean(setApart),
  };
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

  // This "carry" lets us stitch wrapped callings back together
  let carry = '';

  for (const line of normalized.split('\n')) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    const candidate = carry ? `${carry} ${cleanLine}` : cleanLine;

    // First try parsing the stitched candidate
    const parsed = parseCallingLine(candidate);
    if (parsed) {
      carry = '';

      // Deduplicate
      const key = `${parsed.memberName.toLowerCase()}::${parsed.birthday.toLowerCase()}::${parsed.callingName.toLowerCase()}`;
      deduped.set(key, parsed);
      continue;
    }

    // If it didn't parse: decide whether this line is a new row start or a continuation.
    const parts = cleanLine
      .split(/\s{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const looksLikeRowStart = parts.length >= 2 && (parts[1] === 'M' || parts[1] === 'F');

    if (looksLikeRowStart) {
      // Start a new potential row
      carry = cleanLine;
    } else {
      // Continuation of previous line (wrapped calling text)
      carry = carry ? `${carry} ${cleanLine}` : cleanLine;
    }
  }

  // Last chance: parse anything left in carry
  if (carry) {
    const parsed = parseCallingLine(carry);
    if (parsed) {
      const key = `${parsed.memberName.toLowerCase()}::${parsed.birthday.toLowerCase()}::${parsed.callingName.toLowerCase()}`;
      deduped.set(key, parsed);
    }
  }

  return Array.from(deduped.values());
}

export function makeMemberBirthdayKey(memberName: string, birthday: string): string {
  return `${memberName.replace(/\s+/g, ' ').trim().toLowerCase()}::${birthday.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}
