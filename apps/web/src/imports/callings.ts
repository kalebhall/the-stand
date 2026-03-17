import { isHeaderOrFooterLine, normalizeWhitespace } from './pdf-cleanup';

export type ParsedCalling = {
  memberName: string;
  birthday: string;
  organization: string;
  callingName: string;
  sustainedDate: string | null;
  setApart: boolean;
};

// ---------------------------------------------------------------------------
// Known organizations — ORDER MATTERS: longer entries must come before shorter
// prefixes so findBestOrganizationMatch() picks the most-specific match.
// ---------------------------------------------------------------------------
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
  'Aaronic Priesthood',
  'Ward Missionaries',
  'Ward Mission',
  'Primary',
  'Bishopric',
  'Patriarch',
  'Temple Sealers',
  'Temple Workers',
  'Other Callings'
];

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

const SET_APART_TOKEN_PATTERN = /^(?:[\u2713\u2714]|\u00e2\u009c\u0093|\u00e2\u009c\u0094|\u00c3\u00a2\u00c5\u201c\u00e2\u0080\u009c|yes|true|y)$/i;
const NON_SET_APART_TOKEN_PATTERN = /^(?:no|false|n)$/i;
const SUSTAINED_DATE_PATTERN = /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIsoDate(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;

  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = normalized.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (dmy) {
    const month = MONTH_MAP[dmy[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const day = String(Number(dmy[1])).padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }

  const mdy = normalized.match(/^([A-Za-z]{3,})\s+(\d{1,2})\s+(\d{4})$/);
  if (mdy) {
    const month = MONTH_MAP[mdy[1].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const day = String(Number(mdy[2])).padStart(2, '0');
    return `${mdy[3]}-${month}-${day}`;
  }

  const mdyComma = normalized.match(/^([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})$/);
  if (mdyComma) {
    const month = MONTH_MAP[mdyComma[1].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const day = String(Number(mdyComma[2])).padStart(2, '0');
    return `${mdyComma[3]}-${month}-${day}`;
  }

  return null;
}

function normalizeBirthday(input: string): string {
  const raw = normalizeWhitespace(input);
  if (!raw) return raw;

  const dmy = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s*(\d{4})?$/);
  if (dmy) return `${dmy[2]} ${String(Number(dmy[1]))}`;

  const mdy = raw.match(/^([A-Za-z]{3,})\s+(\d{1,2})$/);
  if (mdy) return `${mdy[1]} ${String(Number(mdy[2]))}`;

  return raw;
}

const NAME_WORD_PATTERN = /^[A-Za-z\u2019][A-Za-z'\u2019`.-]*(?:\s+[A-Za-z\u2019][A-Za-z'\u2019`.-]*)+$/;

function looksLikeNameLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  if (!/[a-z]/i.test(normalized) || /^\d/.test(normalized)) return false;
  if (/,/.test(normalized)) return true;
  return NAME_WORD_PATTERN.test(normalized);
}

function looksLikeGenderLine(line: string): boolean {
  return /^(m|f|male|female)$/i.test(normalizeWhitespace(line));
}

function looksLikeAgeLine(line: string): boolean {
  const s = normalizeWhitespace(line);
  if (!/^\d{1,3}$/.test(s)) return false;
  const n = Number(s);
  return n >= 1 && n <= 120;
}

function looksLikeBirthdayLine(line: string): boolean {
  return /^\d{1,2}\s+[a-z]{3,}(\s+\d{4})?$/i.test(normalizeWhitespace(line));
}

function looksLikeSustainedDateLine(line: string): boolean {
  return SUSTAINED_DATE_PATTERN.test(normalizeWhitespace(line));
}

function looksLikePlausibleSustainedDate(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  const m = normalized.match(/^\d{1,2}\s+[A-Za-z]{3,}\s+(\d{4})$/);
  if (!m) return false;
  const year = Number(m[1]);
  return year >= 1990 && year <= 2030;
}

function looksLikeSetApartToken(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  return SET_APART_TOKEN_PATTERN.test(normalized) || NON_SET_APART_TOKEN_PATTERN.test(normalized);
}

function parseSetApartToken(line: string): boolean | null {
  const normalized = normalizeWhitespace(line);
  if (SET_APART_TOKEN_PATTERN.test(normalized)) return true;
  if (NON_SET_APART_TOKEN_PATTERN.test(normalized)) return false;
  return null;
}

function findBestOrganizationMatch(text: string): { org: string; remaining: string } | null {
  const normalized = normalizeWhitespace(text);
  let bestMatch: string | null = null;

  for (const org of KNOWN_ORGANIZATIONS) {
    if (normalized.toLowerCase().startsWith(org.toLowerCase())) {
      if (!bestMatch || org.length > bestMatch.length) bestMatch = org;
    }
  }

  if (!bestMatch) return null;
  return { org: bestMatch, remaining: normalized.substring(bestMatch.length).trim() };
}

function stripTrailingSetApartToken(value: string): { value: string; setApart: boolean } {
  const normalized = normalizeWhitespace(value);
  const parts = normalized.split(/\s+/);
  if (!parts.length) return { value: normalized, setApart: false };

  const last = parts[parts.length - 1];
  const parsed = parseSetApartToken(last);
  if (parsed == null) return { value: normalized, setApart: false };

  parts.pop();
  return { value: parts.join(' ').trim(), setApart: parsed };
}

function finalizeCallingFields(
  raw: string
): { callingName: string; sustainedDate: string | null; setApart: boolean } | null {
  let callingText = normalizeWhitespace(raw);
  if (!callingText) return null;

  const setApartStrip = stripTrailingSetApartToken(callingText);
  const setApart = setApartStrip.setApart;
  callingText = setApartStrip.value;

  let sustainedDate: string | null = null;
  const sustainedDateMatch = callingText.match(/^(.+?)\s*(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\s*$/);
  if (sustainedDateMatch) {
    const year = Number(sustainedDateMatch[2].match(/\d{4}/)![0]);
    if (year >= 1990 && year <= 2030) {
      sustainedDate = toIsoDate(sustainedDateMatch[2]);
      callingText = sustainedDateMatch[1].trim();
    }
  }

  const trailingSustainedToken = callingText.match(/^(.+?)\s+(yes|true|y|no|false|n)\s*$/i);
  if (trailingSustainedToken) {
    callingText = trailingSustainedToken[1].trim();
  }

  if (!callingText) return null;
  return { callingName: callingText, sustainedDate, setApart };
}

function parseBirthdayTokens(
  tokens: string[],
  startIndex: number
): { birthday: string; nextIndex: number } | null {
  if (startIndex + 2 >= tokens.length) return null;

  if (
    /^\d{1,2}$/.test(tokens[startIndex]) &&
    /^[A-Za-z]{3,}$/.test(tokens[startIndex + 1]) &&
    /^\d{4}$/.test(tokens[startIndex + 2])
  ) {
    return {
      birthday: normalizeBirthday(
        `${tokens[startIndex]} ${tokens[startIndex + 1]} ${tokens[startIndex + 2]}`
      ),
      nextIndex: startIndex + 3
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Squished single-line parser
// ---------------------------------------------------------------------------
//
// The LCR PDF frequently produces rows where all columns are concatenated with
// no whitespace between Name, Gender, Age, and BirthDate, e.g.:
//
//   "Leavitt, Curtis LeeM727 Nov 1953Temple and Family History Ward Temple ..."
//   "Barker, Kristopher Nathaniel M2328 Sep 2002Elders QuorumElders Quorum ..."
//
// The pattern is:
//   <name>[optional space](M|F)<age:1-3 digits><day:1-2 digits> <Mon> <yyyy><org><calling>[<date>][<setApart>]
//
// The name ends just before the (M|F) gender token, which may or may not be
// preceded by a space.
// ---------------------------------------------------------------------------

// Matches the fixed-width portion: [M|F][1-3 digit age][1-2 digit day][space][3+letter month][space][4 digit year]
// Everything before this is the name; everything after is org+calling.
const SQUISHED_ROW_RE =
  /^(.+?[A-Za-z'\u2019.])\s*(M|F)\s*(\d{1,3})\s*(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\s*(.*)$/i;

function parseSquishedLine(line: string): ParsedCalling | null {
  const normalized = normalizeWhitespace(line);
  const m = normalized.match(SQUISHED_ROW_RE);
  if (!m) return null;

  const rawName = m[1].trim();
  const age = Number(m[3]);
  const day = m[4];
  const month = MONTH_MAP[m[5].slice(0, 3).toLowerCase()];
  const year = Number(m[6]);
  const rest = normalizeWhitespace(m[7]);

  // Validate: must look like a member name (contains a comma or multiple words)
  if (!looksLikeNameLine(rawName)) return null;

  // Age must be plausible
  if (age < 1 || age > 120) return null;

  // Month must be valid
  if (!month) return null;

  // Year is birth year — must not look like a sustained year
  // (birth years are typically 1900–2020; sustained are 1990–2030 — there's
  //  overlap but we use age as a cross-check)
  if (year < 1900 || year > 2030) return null;

  const birthday = normalizeBirthday(`${day} ${m[5]} ${year}`);

  // The remainder is: OrgNameCallingName[SustainedDate][SetApart]
  // It may look like "Elders QuorumElders Quorum Second Counselor"
  // or "Temple and Family History Ward Temple and Family History Consultant"
  if (!rest) return null;

  const orgMatch = findBestOrganizationMatch(rest);
  if (!orgMatch) return null;

  const finalized = finalizeCallingFields(orgMatch.remaining);
  if (!finalized) return null;

  return {
    memberName: rawName,
    birthday,
    organization: orgMatch.org,
    callingName: finalized.callingName,
    sustainedDate: finalized.sustainedDate,
    setApart: finalized.setApart
  };
}

/**
 * Detect squished format: look for lines matching SQUISHED_ROW_RE in the
 * first 80 non-header lines.
 */
function looksLikeSquishedFormat(lines: string[]): boolean {
  let checked = 0;
  for (const line of lines) {
    if (isHeaderOrFooterLine(line)) continue;
    if (parseSquishedLine(line) !== null) return true;
    if (++checked >= 80) break;
  }
  return false;
}

/**
 * Parse every line as a squished row. Lines that don't match SQUISHED_ROW_RE
 * are attempted with parseTableLine (spaced format) as a fallback.
 * Standalone sustained-date and set-apart lines following a matched row
 * are consumed to patch up the previous record.
 */
function parseSquishedTableFormat(lines: string[]): ParsedCalling[] {
  const callings: ParsedCalling[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isHeaderOrFooterLine(line)) continue;

    // Try squished format first (most common in this PDF)
    const squished = parseSquishedLine(line);
    if (squished) {
      callings.push(squished);
      continue;
    }

    // Try spaced table format
    const spaced = parseTableLine(line);
    if (spaced) {
      callings.push(spaced);
      continue;
    }

    // Standalone sustained-date line — patch the previous record
    if (looksLikeSustainedDateLine(line) && looksLikePlausibleSustainedDate(line) && callings.length > 0) {
      callings[callings.length - 1].sustainedDate = toIsoDate(line);
      continue;
    }

    // Standalone set-apart token — patch the previous record
    if (looksLikeSetApartToken(line) && callings.length > 0) {
      const sa = parseSetApartToken(line);
      if (sa !== null) callings[callings.length - 1].setApart = sa;
      continue;
    }

    // Calling continuation line (e.g. second line of a two-line calling name)
    // Only append if we have a previous record and the line is plain text
    if (
      callings.length > 0 &&
      !/^\d/.test(line) &&
      !looksLikeGenderLine(line) &&
      !looksLikeMemberNameStart(line)
    ) {
      callings[callings.length - 1].callingName = normalizeWhitespace(
        `${callings[callings.length - 1].callingName} ${line}`
      );
    }
  }

  return callings;
}

// ---------------------------------------------------------------------------
// Column-dump parser (kept for PDFs that actually use column-dump layout)
// ---------------------------------------------------------------------------

const CALLING_CONTEXT_WORDS = new Set([
  'sacrament', 'meeting', 'class', 'quorum', 'ward', 'stake', 'district', 'area'
]);

function looksLikeMemberNameStart(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  const m = normalized.match(/^[A-Za-z\u2019'`.-][A-Za-z\u2019'`. -]*,\s*(.+)$/);
  if (!m) return false;
  const afterComma = m[1].trim();
  if (/\d/.test(afterComma)) return false;
  const words = afterComma.split(/\s+/);
  if (words.length > 4) return false;
  if (words.some((w) => CALLING_CONTEXT_WORDS.has(w.toLowerCase()))) return false;
  return true;
}

function matchOrgFromParts(parts: string[]): string | null {
  const joined = parts.join(' ');
  const reversed = [...parts].reverse().join(' ');
  for (const candidate of [joined, reversed]) {
    const m = findBestOrganizationMatch(candidate);
    if (m) return m.org;
  }
  return null;
}

function parseInlineNameGender(line: string): { name: string; gender: string } | null {
  const normalized = normalizeWhitespace(line);
  const m = normalized.match(/^(.+?,\s*.+?)\s+(M|F|Male|Female)\s*$/i);
  if (!m) return null;
  if (!looksLikeMemberNameStart(m[1].trim())) return null;
  return { name: m[1].trim(), gender: m[2].toUpperCase()[0] };
}

function collectOrg(lines: string[], i: number): { org: string; nextIndex: number } | null {
  const n = lines.length;
  const parts: string[] = [];

  for (let attempt = 0; attempt < 5 && i < n; attempt++) {
    const line = normalizeWhitespace(lines[i]);

    if (looksLikeAgeLine(line)) break;
    if (looksLikePlausibleSustainedDate(line)) break;
    if (/^\d{1,2}\s+[A-Za-z]{3,}/.test(line)) break;
    if (looksLikeSetApartToken(line)) break;
    if (looksLikeMemberNameStart(line)) break;
    if (parseInlineNameGender(line) !== null) break;

    parts.push(line);
    i++;

    const org = matchOrgFromParts(parts);
    if (org) {
      if (i < n) {
        const nextLine = normalizeWhitespace(lines[i]);
        const extOrg = matchOrgFromParts([...parts, nextLine]);
        if (extOrg && extOrg.length > org.length) {
          return { org: extOrg, nextIndex: i + 1 };
        }
      }
      return { org, nextIndex: i };
    }

    const couldExtend = KNOWN_ORGANIZATIONS.some(
      (o) =>
        o.toLowerCase().startsWith(parts.join(' ').toLowerCase()) ||
        o.toLowerCase().includes(parts.join(' ').toLowerCase())
    );
    if (!couldExtend) break;
  }

  return null;
}

function parseRowData(
  lines: string[],
  startIndex: number
): {
  birthday: string;
  organization: string;
  callingName: string;
  sustainedDate: string | null;
  setApart: boolean;
  nextIndex: number;
} | null {
  const n = lines.length;
  let i = startIndex;
  if (i >= n) return null;

  const firstLine = normalizeWhitespace(lines[i]);

  let birthday: string;
  let inlineOrg: string | null = null;
  const bdayInlinePrefixMatch = firstLine.match(/^(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\s+(.+)$/);
  const bdayOnlyMatch = firstLine.match(/^(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})$/);

  if (bdayInlinePrefixMatch) {
    birthday = normalizeBirthday(bdayInlinePrefixMatch[1]);
    const orgResult = findBestOrganizationMatch(bdayInlinePrefixMatch[2]);
    if (orgResult) inlineOrg = orgResult.org;
    i++;
  } else if (bdayOnlyMatch) {
    birthday = normalizeBirthday(bdayOnlyMatch[1]);
    i++;
  } else {
    return null;
  }

  let org: string;
  if (inlineOrg) {
    org = inlineOrg;
  } else {
    const orgResult = collectOrg(lines, i);
    if (!orgResult) return null;
    org = orgResult.org;
    i = orgResult.nextIndex;
  }

  const callingParts: string[] = [];
  while (i < n) {
    const line = normalizeWhitespace(lines[i]);

    if (looksLikeAgeLine(line)) break;
    if (looksLikeSetApartToken(line)) break;
    if (looksLikeMemberNameStart(line)) break;
    if (parseInlineNameGender(line) !== null) break;
    if (/^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/.test(line)) break;
    if (/^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}\s/.test(line)) break;

    if (callingParts.length > 0) {
      const orgTest = findBestOrganizationMatch(line);
      if (orgTest && orgTest.remaining === '') break;
    }

    callingParts.push(line);
    i++;
  }

  const callingName = callingParts.join(' ').trim();
  if (!callingName) return null;

  let sustainedDate: string | null = null;
  if (i < n) {
    const line = normalizeWhitespace(lines[i]);
    if (looksLikeSustainedDateLine(line) && looksLikePlausibleSustainedDate(line)) {
      sustainedDate = toIsoDate(line);
      i++;
    }
  }

  let setApart = false;
  if (i < n && looksLikeSetApartToken(lines[i])) {
    setApart = parseSetApartToken(lines[i]) ?? false;
    i++;
  }

  return { birthday, organization: org, callingName, sustainedDate, setApart, nextIndex: i };
}

function parsePdfCallingsColumnDump(lines: string[]): ParsedCalling[] {
  const callings: ParsedCalling[] = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = normalizeWhitespace(lines[i]);

    if (isHeaderOrFooterLine(line) && !looksLikeAgeLine(line)) {
      i++;
      continue;
    }

    if (looksLikeSetApartToken(line)) {
      i++;
      continue;
    }

    const inlineNameGender = parseInlineNameGender(line);
    if (inlineNameGender) {
      i++;
      if (i < n && looksLikeAgeLine(normalizeWhitespace(lines[i]))) i++;
      const rowData = parseRowData(lines, i);
      if (rowData) {
        callings.push({
          memberName: inlineNameGender.name,
          birthday: rowData.birthday,
          organization: rowData.organization,
          callingName: rowData.callingName,
          sustainedDate: rowData.sustainedDate,
          setApart: rowData.setApart
        });
        i = rowData.nextIndex;
      }
      continue;
    }

    if (looksLikeMemberNameStart(line)) {
      const names: string[] = [];
      let cur: string[] = [];
      while (i < n) {
        const ll = normalizeWhitespace(lines[i]);
        if (looksLikeGenderLine(ll) || looksLikeAgeLine(ll) || looksLikeSetApartToken(ll)) break;
        if (parseInlineNameGender(ll) !== null) break;
        if (looksLikeMemberNameStart(ll)) {
          if (cur.length) names.push(cur.join(' '));
          cur = [ll];
        } else if (/^[A-Za-z\u2019][A-Za-z\u2019' .-]*$/.test(ll) && !ll.includes(',')) {
          cur.push(ll);
        } else {
          if (cur.length) names.push(cur.join(' '));
          cur = [];
          break;
        }
        i++;
      }
      if (cur.length) names.push(cur.join(' '));

      const genders: string[] = [];
      while (i < n && looksLikeGenderLine(normalizeWhitespace(lines[i]))) {
        genders.push(lines[i]);
        i++;
      }

      if (names.length !== genders.length) continue;

      let rowIdx = 0;
      while (rowIdx < names.length && i < n) {
        const ageBatch: number[] = [];
        while (i < n && looksLikeAgeLine(normalizeWhitespace(lines[i]))) {
          ageBatch.push(Number(normalizeWhitespace(lines[i])));
          i++;
        }
        if (ageBatch.length === 0) break;

        for (const _age of ageBatch) {
          if (rowIdx >= names.length || i >= n) break;
          const rowData = parseRowData(lines, i);
          if (!rowData) break;
          callings.push({
            memberName: names[rowIdx],
            birthday: rowData.birthday,
            organization: rowData.organization,
            callingName: rowData.callingName,
            sustainedDate: rowData.sustainedDate,
            setApart: rowData.setApart
          });
          i = rowData.nextIndex;
          rowIdx++;
        }
      }

      while (i < n && looksLikeSetApartToken(normalizeWhitespace(lines[i]))) i++;
      continue;
    }

    i++;
  }

  return callings;
}

function looksLikeColumnDumpFormat(lines: string[]): boolean {
  let nameCount = 0;
  let genderCount = 0;
  let inNameBlock = false;

  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const line = normalizeWhitespace(lines[i]);
    if (isHeaderOrFooterLine(line) && !looksLikeAgeLine(line)) continue;

    if (looksLikeMemberNameStart(line)) {
      inNameBlock = true;
      nameCount++;
    } else if (inNameBlock && looksLikeGenderLine(line)) {
      genderCount++;
      if (genderCount >= 3) return true;
    } else if (inNameBlock && !looksLikeAgeLine(line) && !/^[A-Za-z]/.test(line)) {
      inNameBlock = false;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Original row-based parsers (kept as fallbacks)
// ---------------------------------------------------------------------------

function parseSpacedTableLine(line: string): ParsedCalling | null {
  const normalized = normalizeWhitespace(line);
  const tokens = normalized.split(/\s+/);
  if (tokens.length < 8) return null;

  let genderIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (/^(m|f|male|female)$/i.test(tokens[i])) {
      genderIdx = i;
      break;
    }
  }
  if (genderIdx <= 0) return null;

  const memberName = tokens.slice(0, genderIdx).join(' ');
  let idx = genderIdx + 1;
  if (idx >= tokens.length || !/^\d{1,3}$/.test(tokens[idx])) return null;
  idx++;

  const birthdayParsed = parseBirthdayTokens(tokens, idx);
  if (!birthdayParsed) return null;
  const birthday = birthdayParsed.birthday;
  idx = birthdayParsed.nextIndex;

  const orgMatch = findBestOrganizationMatch(tokens.slice(idx).join(' '));
  if (!orgMatch) return null;
  const finalized = finalizeCallingFields(orgMatch.remaining);
  if (!finalized) return null;

  return {
    memberName,
    birthday,
    organization: orgMatch.org,
    callingName: finalized.callingName,
    sustainedDate: finalized.sustainedDate,
    setApart: finalized.setApart
  };
}

function parseCompactTableLine(line: string): ParsedCalling | null {
  const normalized = normalizeWhitespace(line);
  if (!looksLikeNameLine(normalized)) return null;

  const birthdayMatch = normalized.match(/(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/);
  if (!birthdayMatch || birthdayMatch.index === undefined) return null;

  const beforeBirthday = normalized.slice(0, birthdayMatch.index).trim();
  const afterBirthday = normalized.slice(birthdayMatch.index + birthdayMatch[1].length).trim();
  const prefixMatch = beforeBirthday.match(/^(.*?)(male|female|m|f)\s*(\d{1,3})$/i);
  if (!prefixMatch) return null;

  const memberName = normalizeWhitespace(prefixMatch[1]);
  if (!looksLikeNameLine(memberName)) return null;

  const orgMatch = findBestOrganizationMatch(afterBirthday);
  if (!orgMatch) return null;
  const finalized = finalizeCallingFields(orgMatch.remaining);
  if (!finalized) return null;

  return {
    memberName,
    birthday: normalizeBirthday(birthdayMatch[1]),
    organization: orgMatch.org,
    callingName: finalized.callingName,
    sustainedDate: finalized.sustainedDate,
    setApart: finalized.setApart
  };
}

function parseTableLine(line: string): ParsedCalling | null {
  return parseSpacedTableLine(line) ?? parseCompactTableLine(line);
}

function parsePdfCallingsTableFormat(lines: string[]): ParsedCalling[] {
  const callings: ParsedCalling[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isHeaderOrFooterLine(line)) {
      i++;
      continue;
    }

    const parsed = parseTableLine(line);
    if (!parsed) {
      i++;
      continue;
    }

    i++;
    while (i < lines.length) {
      const nextLine = lines[i];

      if (looksLikeSustainedDateLine(nextLine) && looksLikePlausibleSustainedDate(nextLine)) {
        parsed.sustainedDate = toIsoDate(nextLine);
        i++;
        continue;
      }

      if (looksLikeSetApartToken(nextLine)) {
        const setApart = parseSetApartToken(nextLine);
        if (setApart != null) parsed.setApart = setApart;
        i++;
        continue;
      }

      if (isHeaderOrFooterLine(nextLine)) {
        i++;
        continue;
      }

      if (parseTableLine(nextLine)) break;
      parsed.callingName = normalizeWhitespace(`${parsed.callingName} ${nextLine}`);
      i++;
    }

    callings.push(parsed);
  }

  return callings;
}

function parsePdfCallingsMultiLine(lines: string[]): ParsedCalling[] {
  const callings: ParsedCalling[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isHeaderOrFooterLine(line)) {
      i++;
      continue;
    }
    if (!looksLikeNameLine(line)) {
      i++;
      continue;
    }

    const memberName = normalizeWhitespace(line);
    i++;
    if (i >= lines.length || !looksLikeGenderLine(lines[i])) continue;
    i++;
    if (i >= lines.length || !looksLikeAgeLine(lines[i])) continue;
    i++;
    if (i >= lines.length || !looksLikeBirthdayLine(lines[i])) continue;
    const birthday = normalizeBirthday(lines[i]);
    i++;

    const orgCallingLines: string[] = [];
    while (i < lines.length) {
      const nextLine = lines[i];
      if (isHeaderOrFooterLine(nextLine)) {
        i++;
        continue;
      }
      if (
        looksLikeNameLine(nextLine) ||
        looksLikeSustainedDateLine(nextLine) ||
        looksLikeSetApartToken(nextLine)
      )
        break;
      orgCallingLines.push(normalizeWhitespace(nextLine));
      i++;
    }

    if (!orgCallingLines.length) continue;
    const orgMatch = findBestOrganizationMatch(orgCallingLines.join(' '));
    if (!orgMatch) continue;
    const finalized = finalizeCallingFields(orgMatch.remaining);
    if (!finalized) continue;

    let sustainedDate = finalized.sustainedDate;
    let setApart = finalized.setApart;

    if (
      i < lines.length &&
      looksLikeSustainedDateLine(lines[i]) &&
      looksLikePlausibleSustainedDate(lines[i])
    ) {
      sustainedDate = toIsoDate(lines[i]);
      i++;
    }
    if (i < lines.length && looksLikeSetApartToken(lines[i])) {
      const parsed = parseSetApartToken(lines[i]);
      if (parsed != null) setApart = parsed;
      i++;
    }

    callings.push({
      memberName,
      birthday,
      organization: orgMatch.org,
      callingName: finalized.callingName,
      sustainedDate,
      setApart
    });
  }

  return callings;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseCallingsPdfText(rawText: string): ParsedCalling[] {
  const lines = rawText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let callings: ParsedCalling[];

  if (looksLikeSquishedFormat(lines)) {
    // Most common: all fields concatenated on one line per record
    callings = parseSquishedTableFormat(lines);
  } else if (looksLikeColumnDumpFormat(lines)) {
    // Column-dump: names block, genders block, then interleaved data
    callings = parsePdfCallingsColumnDump(lines);
  } else {
    // Legacy row-based formats
    let tableLike = false;
    for (let i = 0; i < Math.min(lines.length, 80); i++) {
      if (isHeaderOrFooterLine(lines[i])) continue;
      if (parseTableLine(lines[i])) {
        tableLike = true;
        break;
      }
    }
    callings = tableLike ? parsePdfCallingsTableFormat(lines) : parsePdfCallingsMultiLine(lines);
  }

  const deduped = new Map<string, ParsedCalling>();
  for (const calling of callings) {
    const key = `${calling.memberName.toLowerCase()}::${calling.birthday.toLowerCase()}::${calling.callingName.toLowerCase()}`;
    if (!deduped.has(key)) deduped.set(key, calling);
  }

  return Array.from(deduped.values());
}

export function makeMemberBirthdayKey(memberName: string, birthday: string): string {
  return `${memberName.replace(/\s+/g, ' ').trim().toLowerCase()}::${normalizeBirthday(birthday)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()}`;
}
