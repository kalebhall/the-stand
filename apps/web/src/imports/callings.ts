export type ParsedCalling = {
  memberName: string;
  birthday: string;
  organization: string;
  callingName: string;
  sustained: boolean;
  setApart: boolean;
};

const HEADER_LINE_PATTERN = /^name\s+gender\s+age\s+birth\s+date\s+organization\s+calling\s+sustained\s+set\s+apart$/i;
const BOOLEAN_TOKEN_PATTERN = /^(yes|no|true|false|y|n|✔|✓|√|×)$/i;

const KNOWN_ORGANIZATIONS = [
  'Stake Young Women',
  'Stake Primary',
  'Stake Temple and Family History',
  'Temple and Family History',
  'Relief Society',
  'Elders Quorum',
  'Sunday School',
  'Young Women',
  'Young Men',
  'Aaronic Priesthood Quorums',
  'Ward Missionaries',
  'Ward Mission',
  'Primary',
  'Bishopric',
  'Patriarch',
  'Temple Sealers',
  'Temple Workers',
  'Other Callings',
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

function looksLikeDateTail(a?: string, b?: string, c?: string): boolean {
  // Support "9 Mar 2025" and also "2025✔" as the final token.
  return (
    /^\d{1,2}$/.test(a ?? '') &&
    /^[A-Za-z]{3,}$/.test(b ?? '') &&
    /^\d{4}/.test(c ?? '')
  );
}

function isHeaderOrFooterLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  
  // Header patterns
  if (HEADER_LINE_PATTERN.test(normalized)) return true;
  if (/^name\s+gender\s+age/i.test(normalized)) return true;
  if (/^gender\s+age\s+birth/i.test(normalized)) return true;
  if (/^birth\s+date\s+organization/i.test(normalized)) return true;
  if (/^organization\s+calling\s+sustained/i.test(normalized)) return true;
  if (/^calling\s+sustained\s+set\s+apart/i.test(normalized)) return true;
  if (/^sustained\s+set\s+apart/i.test(normalized)) return true;
  
  // Document title/organizational headers
  if (/^members\s+with\s+callings/i.test(normalized)) return true;
  if (/^freedom\s+park\s+ward/i.test(normalized)) return true;
  if (/^las\s+vegas\s+nevada/i.test(normalized)) return true;
  if (/ward\s*\(\d+\)/i.test(normalized)) return true;
  if (/stake\s*\(\d+\)/i.test(normalized)) return true;
  
  // Footer patterns
  if (/^for\s+church\s+use\s+only/i.test(normalized)) return true;
  if (/^©\s*\d{4}\s+by\s+intellectual\s+reserve/i.test(normalized)) return true;
  if (/all\s+rights\s+reserved/i.test(normalized)) return true;
  
  // Date stamps (e.g., "26 Feb 2026" or "February 20, 2026")
  if (/^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$/i.test(normalized)) return true;
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}$/i.test(normalized)) return true;
  
  // Page numbers and markers
  if (/^\.{3}$/i.test(normalized)) return true; // Just "..."
  if (/^\d+$/i.test(normalized) && normalized.length <= 3) return true; // Page numbers like "1", "2", "10"
  if (/^page\s+\d+/i.test(normalized)) return true;
  
  // Count/total rows
  if (/^count\s*:\s*\d+/i.test(normalized)) return true;
  if (/^total\s*:\s*\d+/i.test(normalized)) return true;
  if (/^count\s+\d+/i.test(normalized)) return true;
  if (/^count:/i.test(normalized)) return true;
  
  return false;
}

function parseSingleSpaceRow(normalizedLine: string): ParsedCalling | null {
  const tokens = normalizedLine.split(' ').filter(Boolean);
  const genderIdx = tokens.findIndex((t) => /^(male|female|m|f)$/i.test(t));
  if (genderIdx < 1) return null;

  const memberName = tokens.slice(0, genderIdx).join(' ');
  const age = tokens[genderIdx + 1];
  if (!/^\d+$/.test(age ?? '')) return null;

  // Birthday: support BOTH "Jan 15" and "26 May 1960"
  const t1 = tokens[genderIdx + 2];
  const t2 = tokens[genderIdx + 3];
  const t3 = tokens[genderIdx + 4];

  let birthdayRaw = '';
  let afterBirthdayIdx = genderIdx + 4;

  // DMY: "26 May" or "26 May 1960"
  if (/^\d{1,2}$/.test(t1 ?? '') && /^[A-Za-z]{3,}$/.test(t2 ?? '')) {
    birthdayRaw = t3 && /^\d{4}$/.test(t3) ? `${t1} ${t2} ${t3}` : `${t1} ${t2}`;
    afterBirthdayIdx = t3 && /^\d{4}$/.test(t3) ? genderIdx + 5 : genderIdx + 4;
  }
  // MDY-lite: "May 26"
  else if (/^[A-Za-z]{3,}$/.test(t1 ?? '') && /^\d{1,2}$/.test(t2 ?? '')) {
    birthdayRaw = `${t1} ${t2}`;
    afterBirthdayIdx = genderIdx + 4;
  } else {
    return null;
  }

  const birthday = normalizeBirthday(birthdayRaw);

  const remainder = [...tokens.slice(afterBirthdayIdx)];
  if (!remainder.length) return null;

  let setApartRaw = '';
  let sustainedRaw = '';

  // Pull up to two trailing fields that are either booleans (Yes/No/✔) OR date groups (9 Mar 2025✔).
  for (let i = 0; i < 2; i++) {
    const n = remainder.length;

    // Date tail like: 9 Mar 2025✔
    if (n >= 3 && looksLikeDateTail(remainder[n - 3], remainder[n - 2], remainder[n - 1])) {
      const group = `${remainder[n - 3]} ${remainder[n - 2]} ${remainder[n - 1]}`;
      remainder.splice(n - 3, 3);

      if (!setApartRaw) setApartRaw = group;
      else sustainedRaw = group;

      continue;
    }

    // Simple boolean tokens: Yes/No/✔/True/etc
    if (n >= 1 && BOOLEAN_TOKEN_PATTERN.test(remainder[n - 1] ?? '')) {
      const token = remainder.pop() ?? '';
      if (!setApartRaw) setApartRaw = token;
      else sustainedRaw = token;
      continue;
    }

    break;
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
    setApart: parseBoolean(setApartRaw),
  };
}

function parseCallingLine(line: string): ParsedCalling | null {
  const normalizedLine = normalizeWhitespace(line);
  if (!normalizedLine) return null;

  // Use comprehensive header/footer detection
  if (isHeaderOrFooterLine(normalizedLine)) return null;

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
      // Could be: [calling, sustained] or [calling, setApart]
      // If second field looks like a date/boolean, it's one of the status fields
      const lastField = rest[1] ?? '';
      if (BOOLEAN_TOKEN_PATTERN.test(lastField) || /\d/.test(lastField)) {
        callingName = rest[0] ?? '';
        // Assume it's setApart if present (more common to have setApart without sustained)
        setApartRaw = lastField;
      } else {
        // Both fields are part of the calling name
        callingName = rest.join(' ').trim();
      }
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

    // Skip header/footer lines using comprehensive check
    if (isHeaderOrFooterLine(cleanLine)) continue;

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
