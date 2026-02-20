export type ParsedCalling = {
  memberName: string;
  birthday: string;
  organization: string;
  callingName: string;
  sustained: boolean;
  setApart: boolean;
};

const HEADER_LINE_PATTERN = /^name\s+gender\s+age\s+birth\s+date\s+organization\s+calling\s+sustained\s+set\s+apart$/i;
const BOOLEAN_TOKEN_PATTERN = /^(yes|no|true|false|y|n|✔|✓|√)$/i;
const KNOWN_ORGANIZATIONS = [
  'Temple and Family History',
  'Relief Society',
  'Elders Quorum',
  'Sunday School',
  'Young Women',
  'Young Men',
  'Ward Mission',
  'Primary',
  'Bishopric'
];

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function normalizeBirthday(input: string): string {
  const raw = normalizeWhitespace(input);
  if (!raw) return raw;

  // Matches: "26 May 1960" or "26 May" (day month [year])
  const dmy = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s*(\d{4})?$/);
  if (dmy) {
    const day = String(Number(dmy[1])); // strips leading zero
    const month = dmy[2];
    // Convert to "May 26" style
    return `${month} ${day}`;
  }

  // Already in "May 26" style → keep it
  const mdy = raw.match(/^([A-Za-z]{3,})\s+(\d{1,2})$/);
  if (mdy) {
    const month = mdy[1];
    const day = String(Number(mdy[2]));
    return `${month} ${day}`;
  }

  return raw;
}

function parseBoolean(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  const normalized = raw.toLowerCase();
  if (raw.includes('✔') || raw.includes('✓') || raw.includes('√')) return true;
  if (/\d/.test(raw)) return true;
  return normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === 'set apart';
}

function parseSingleSpaceRow(normalizedLine: string): ParsedCalling | null {
  const tokens = normalizedLine.split(' ').filter(Boolean);
  const genderIdx = tokens.findIndex((t) => /^(male|female|m|f)$/i.test(t));
  if (genderIdx < 1) return null;

  const memberName = tokens.slice(0, genderIdx).join(' ');
  const age = tokens[genderIdx + 1];
  if (!/^\d+$/.test(age ?? '')) return null;

  const month = tokens[genderIdx + 2];
  const day = tokens[genderIdx + 3];
  if (!month || !day || !/^\d{1,2}$/.test(day)) return null;
  const birthday = `${month} ${day}`;

  const remainder = [...tokens.slice(genderIdx + 4)];
  if (!remainder.length) return null;

  let setApartRaw = '';
  let sustainedRaw = '';

  if (BOOLEAN_TOKEN_PATTERN.test(remainder[remainder.length - 1] ?? '')) {
    setApartRaw = remainder.pop() ?? '';
  }
  if (BOOLEAN_TOKEN_PATTERN.test(remainder[remainder.length - 1] ?? '')) {
    sustainedRaw = remainder.pop() ?? '';
  }

  if (remainder.length < 2) return null;

  let organization = remainder[0] ?? '';
  let orgTokenCount = 1;
  for (const org of KNOWN_ORGANIZATIONS) {
    const orgParts = org.split(' ');
    const matches = orgParts.every((part, idx) => (remainder[idx] ?? '').toLowerCase() === part.toLowerCase());
    if (matches && orgParts.length > orgTokenCount) {
      orgTokenCount = orgParts.length;
      organization = org;
    }
  }

  const callingName = remainder.slice(orgTokenCount).join(' ').trim();
  if (!memberName || !organization || !callingName) return null;

  return {
    memberName,
    birthday,
    organization,
    callingName,
    sustained: parseBoolean(sustainedRaw),
    setApart: parseBoolean(setApartRaw)
  };
}

function parseCallingLine(line: string): ParsedCalling | null {
  const normalizedLine = normalizeWhitespace(line);
  if (!normalizedLine) return null;

  if (HEADER_LINE_PATTERN.test(normalizedLine) || /members\s+with\s+callings/i.test(normalizedLine)) return null;
  if (/^count\b/i.test(normalizedLine) || /^total\b/i.test(normalizedLine)) return null;

  const parts = line
    .trim()
    .split(/\s{2,}/)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0);

  if (parts.length >= 6) {
    const [memberName, _gender, _age, birthday, organization, ...rest] = parts;
    if (!memberName || !birthday || !organization || rest.length < 1) return null;

    let callingName = '';
    let sustainedRaw = '';
    let setApartRaw = '';

    if (rest.length >= 3) {
      sustainedRaw = rest[rest.length - 2] ?? '';
      setApartRaw = rest[rest.length - 1] ?? '';
      callingName = rest.slice(0, -2).join(' ').trim();
    } else if (rest.length === 2) {
      sustainedRaw = rest[1] ?? '';
      callingName = rest[0] ?? '';
    } else {
      callingName = rest[0] ?? '';
    }

    if (!callingName) return null;

    return {
      memberName,
      birthday: normalizeBirthday(birthday),
      organization,
      callingName,
      sustained: parseBoolean(sustainedRaw),
      setApart: parseBoolean(setApartRaw),
    };
  }

  return parseSingleSpaceRow(normalizedLine);
}

function looksLikeRowStart(line: string): boolean {
  const normalizedLine = normalizeWhitespace(line);
  const tokens = normalizedLine.split(' ').filter(Boolean);
  const genderIdx = tokens.findIndex((t) => /^(male|female|m|f)$/i.test(t));
  return genderIdx >= 1;
}

export function parseCallingsPdfText(rawText: string): ParsedCalling[] {
  const normalized = rawText.replace(/\r\n?/g, '\n');
  const deduped = new Map<string, ParsedCalling>();
  let carry = '';

  for (const line of normalized.split('\n')) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    if (carry && looksLikeRowStart(cleanLine)) {
      const carryParsed = parseCallingLine(carry);
      if (carryParsed) {
        const key = `${carryParsed.memberName.toLowerCase()}::${carryParsed.birthday.toLowerCase()}::${carryParsed.callingName.toLowerCase()}`;
        deduped.set(key, carryParsed);
      }
      carry = '';
    }

    const candidate = carry ? `${carry}  ${cleanLine}` : cleanLine;
    const parsed = parseCallingLine(candidate);
    if (parsed) {
      carry = '';
      const key = `${parsed.memberName.toLowerCase()}::${parsed.birthday.toLowerCase()}::${parsed.callingName.toLowerCase()}`;
      deduped.set(key, parsed);
      continue;
    }

    if (looksLikeRowStart(cleanLine)) {
      carry = cleanLine;
    } else {
      carry = carry ? `${carry}  ${cleanLine}` : cleanLine;
    }
  }

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
  return `${memberName.replace(/\s+/g, ' ').trim().toLowerCase()}::${normalizeBirthday(birthday)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()}`;
}
