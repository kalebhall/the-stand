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
  'Aaronic Priesthood',           // BUG-FIX: was missing — caused all AP rows to fail
  'Ward Missionaries',
  'Ward Mission',
  'Primary',
  'Bishopric',
  'Patriarch',
  'Temple Sealers',
  'Temple Workers',
  'Other Callings'
];

// Words that appear after the comma in a calling title (not a member name)
const CALLING_CONTEXT_WORDS = new Set([
  'sacrament', 'meeting', 'class', 'quorum', 'ward', 'stake', 'district', 'area'
]);

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

const SET_APART_TOKEN_PATTERN = /^(?:[\u2713\u2714]|\u00e2\u009c\u0093|\u00e2\u009c\u0094|\u00c3\u00a2\u00c5\u201c\u00e2\u0080\u009c|yes|true|y)$/i;
const NON_SET_APART_TOKEN_PATTERN = /^(?:no|false|n)$/i;
const SUSTAINED_DATE_PATTERN = /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/;

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

// Allow ASCII name chars plus Unicode right-single-quote (\u2019) used in names like Ra\u2019sean
const NAME_WORD_PATTERN = /^[A-Za-z\u2019][A-Za-z'\u2019`.-]*(?:\s+[A-Za-z\u2019][A-Za-z'\u2019`.-]*)+$/;

function looksLikeNameLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  if (!/[a-z]/i.test(normalized) || /^\d/.test(normalized)) return false;
  if (/,/.test(normalized)) return true;
  return NAME_WORD_PATTERN.test(normalized);
}

/**
 * Returns true if the line looks like "Last, First [Middle]" — a member name
 * in the LCR column-dump format — and NOT a calling like "Greeter, Sacrament Meeting".
 *
 * BUG-FIX: Previously any comma-containing line was treated as a name, which caused
 * callings like "Greeter, Sacrament Meeting" to start spurious name-blocks.
 */
function looksLikeMemberNameStart(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  const m = normalized.match(/^[A-Za-z\u2019'`.-][A-Za-z\u2019'`. -]*,\s*(.+)$/);
  if (!m) return false;
  const afterComma = m[1].trim();
  // Reject if the part after the comma contains digits
  if (/\d/.test(afterComma)) return false;
  // Reject if the part after the comma has more than 4 words (callings are usually longer)
  const words = afterComma.split(/\s+/);
  if (words.length > 4) return false;
  // Reject if any word after the comma is a typical calling-context word
  if (words.some((w) => CALLING_CONTEXT_WORDS.has(w.toLowerCase()))) return false;
  return true;
}

function looksLikeGenderLine(line: string): boolean {
  return /^(m|f|male|female)$/i.test(normalizeWhitespace(line));
}

/**
 * BUG-FIX: The old looksLikeAgeLine() returned true for ANY 1–3 digit number,
 * which meant it matched page numbers (1, 2, 3…). isHeaderOrFooterLine already
 * filters standalone numbers ≤ 3 digits as page numbers, but the column-dump
 * parser needs to distinguish real ages (10–120) from page numbers.
 * We keep the same range but document the intent clearly.
 */
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

/**
 * BUG-FIX: The old code accepted any date as a sustained date, so birth-year
 * dates like "9 May 1949" were incorrectly recorded as sustained dates.
 * Sustained dates are always recent; we restrict to years 1990–2030.
 */
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

function finalizeCallingFields(raw: string): { callingName: string; sustainedDate: string | null; setApart: boolean } | null {
  let callingText = normalizeWhitespace(raw);
  if (!callingText) return null;

  const setApartStrip = stripTrailingSetApartToken(callingText);
  const setApart = setApartStrip.setApart;
  callingText = setApartStrip.value;

  let sustainedDate: string | null = null;
  const sustainedDateMatch = callingText.match(/^(.+?)\s*(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\s*$/);
  if (sustainedDateMatch) {
    const year = Number(sustainedDateMatch[2].match(/\d{4}/)![0]);
    if (year >= 1990 && year <= 2030) {  // BUG-FIX: only plausible sustained years
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


function parseBirthdayTokens(tokens: string[], startIndex: number): { birthday: string; nextIndex: number } | null {
  if (startIndex + 2 >= tokens.length) return null;

  if (
    /^\d{1,2}$/.test(tokens[startIndex]) &&
    /^[A-Za-z]{3,}$/.test(tokens[startIndex + 1]) &&
    /^\d{4}$/.test(tokens[startIndex + 2])
  ) {
    return {
      birthday: normalizeBirthday(`${tokens[startIndex]} ${tokens[startIndex + 1]} ${tokens[startIndex + 2]}`),
      nextIndex: startIndex + 3
    };
  }

  return null;
}


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
      if (looksLikeNameLine(nextLine) || looksLikeSustainedDateLine(nextLine) || looksLikeSetApartToken(nextLine)) break;
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

    if (i < lines.length && looksLikeSustainedDateLine(lines[i]) && looksLikePlausibleSustainedDate(lines[i])) {
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
// Column-dump parser — handles the LCR "Members with Callings" PDF format
// ---------------------------------------------------------------------------
//
// The LCR PDF dumps columns in reading order per column, not per row. A page
// therefore looks like:
//
//   Acosta, Frank          <- all names first
//   Amber, Tim
//   August, Agnes Alana
//   ...
//   M                      <- then all genders
//   M
//   F
//   ...
//   65                     <- then interleaved: age, bday[+org], [org], calling, [sustained]
//   26 May 1960 Elders Quorum
//   Elders Quorum Secretary
//   9 Mar 2025
//   67
//   23 Nov 1958 Elders Quorum
//   Elders Quorum Activity
//   Committee Member
//   27 Jul 2025
//   ...
//
// When a member holds multiple callings, their age may appear multiple times
// (once per calling) or be batched (e.g. two consecutive "76" lines).
//
// Org lines are sometimes split across lines and occasionally appear in
// reversed order relative to how pdfminer reads them.
// ---------------------------------------------------------------------------

/**
 * Try to match accumulated lines (in any order) against KNOWN_ORGANIZATIONS.
 * Returns the matched org name or null.
 */
function matchOrgFromParts(parts: string[]): string | null {
  // Try every permutation up to 3 parts — the org names are short
  const joined = parts.join(' ');
  const reversed = [...parts].reverse().join(' ');
  for (const candidate of [joined, reversed]) {
    const m = findBestOrganizationMatch(candidate);
    if (m) return m.org;
  }
  return null;
}

/**
 * Collect org name lines starting at index i.
 * Handles split lines (e.g. "Temple and Family" / "History") and
 * reversed-order lines (e.g. "Quorums" / "Aaronic Priesthood").
 *
 * BUG-FIX: The old code only checked startsWith() in forward order, so
 * reversed org fragments like ["Quorums", "Aaronic Priesthood"] were not
 * matched and the record was dropped.
 */
function collectOrg(lines: string[], i: number): { org: string; nextIndex: number } | null {
  const n = lines.length;
  const parts: string[] = [];

  for (let attempt = 0; attempt < 5 && i < n; attempt++) {
    const line = normalizeWhitespace(lines[i]);

    // Stop conditions — these belong to the next field, not the org
    if (looksLikeAgeLine(line)) break;
    if (looksLikePlausibleSustainedDate(line)) break;
    if (/^\d{1,2}\s+[A-Za-z]{3,}/.test(line)) break;  // bday line (with or without trailing org)
    if (looksLikeSetApartToken(line)) break;
    if (looksLikeMemberNameStart(line)) break;
    if (parseInlineNameGender(line) !== null) break;

    parts.push(line);
    i++;

    const org = matchOrgFromParts(parts);
    if (org) {
      // Try extending one more line
      if (i < n) {
        const nextLine = normalizeWhitespace(lines[i]);
        const extOrg = matchOrgFromParts([...parts, nextLine]);
        if (extOrg && extOrg.length > org.length) {
          return { org: extOrg, nextIndex: i + 1 };
        }
      }
      return { org, nextIndex: i };
    }

    // Keep consuming only if the accumulated text could still be an org prefix
    const couldExtend = KNOWN_ORGANIZATIONS.some((org) =>
      org.toLowerCase().startsWith(parts.join(' ').toLowerCase()) ||
      org.toLowerCase().includes(parts.join(' ').toLowerCase())
    );
    if (!couldExtend) break;
  }

  return null;
}

/**
 * If the line is "Last, First M" or "Last, First Middle M", return
 * { name, gender }. Otherwise return null.
 */
function parseInlineNameGender(line: string): { name: string; gender: string } | null {
  const normalized = normalizeWhitespace(line);
  const m = normalized.match(/^(.+?,\s*.+?)\s+(M|F|Male|Female)\s*$/i);
  if (!m) return null;
  if (!looksLikeMemberNameStart(m[1].trim())) return null;
  return { name: m[1].trim(), gender: m[2].toUpperCase()[0] };
}

/**
 * Parse one row's data: bday[+org], [org-continuation lines], calling lines,
 * optional sustained date.
 *
 * BUG-FIX: Dates with year < 1990 are birth dates, not sustained dates.
 * BUG-FIX: A line that starts with a date but has trailing text (e.g.
 * "28 Sep 2002 Elders Quorum") terminates calling accumulation instead
 * of being appended to the calling name.
 */
function parseRowData(
  lines: string[],
  startIndex: number
): { birthday: string; organization: string; callingName: string; sustainedDate: string | null; setApart: boolean; nextIndex: number } | null {
  const n = lines.length;
  let i = startIndex;
  if (i >= n) return null;

  const firstLine = normalizeWhitespace(lines[i]);

  // Birthday line — may include org name inline: "9 May 1949 Relief Society"
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

  // Org — either inline or from following lines
  let org: string;
  if (inlineOrg) {
    org = inlineOrg;
  } else {
    const orgResult = collectOrg(lines, i);
    if (!orgResult) return null;
    org = orgResult.org;
    i = orgResult.nextIndex;
  }

  // Calling — accumulate lines until a terminator
  const callingParts: string[] = [];
  while (i < n) {
    const line = normalizeWhitespace(lines[i]);

    // Hard stops
    if (looksLikeAgeLine(line)) break;
    if (looksLikeSetApartToken(line)) break;
    if (looksLikeMemberNameStart(line)) break;
    if (parseInlineNameGender(line) !== null) break;

    // BUG-FIX: A date-only line terminates the calling regardless of year
    if (/^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/.test(line)) break;

    // BUG-FIX: A line that starts with a date (e.g. "28 Sep 2002 Elders Quorum")
    // is the start of the NEXT row, not a calling continuation.
    if (/^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}\s/.test(line)) break;

    // If we already have calling content, a new org line means next record
    if (callingParts.length > 0) {
      const orgTest = findBestOrganizationMatch(line);
      if (orgTest && orgTest.remaining === '') break;
    }

    callingParts.push(line);
    i++;
  }

  const callingName = callingParts.join(' ').trim();
  if (!callingName) return null;

  // Sustained date — BUG-FIX: only accept plausible years
  let sustainedDate: string | null = null;
  if (i < n) {
    const line = normalizeWhitespace(lines[i]);
    if (looksLikeSustainedDateLine(line) && looksLikePlausibleSustainedDate(line)) {
      sustainedDate = toIsoDate(line);
      i++;
    }
  }

  // Set-apart checkmark
  let setApart = false;
  if (i < n && looksLikeSetApartToken(lines[i])) {
    setApart = parseSetApartToken(lines[i]) ?? false;
    i++;
  }

  return { birthday, organization: org, callingName, sustainedDate, setApart, nextIndex: i };
}

/**
 * Main parser for the LCR "Members with Callings" PDF column-dump format.
 *
 * A page is structured as:
 *   [names block] [genders block] [interleaved age + row-data per person]
 *
 * One name-block may contain multiple members. Within the data section,
 * ages appear one per calling row, but when a member has multiple callings
 * their age may be repeated (batched) before the first row's data.
 */
function parsePdfCallingsColumnDump(lines: string[]): ParsedCalling[] {
  const callings: ParsedCalling[] = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = normalizeWhitespace(lines[i]);

    if (isHeaderOrFooterLine(line) && !looksLikeAgeLine(line)) {
      // BUG-FIX: isHeaderOrFooterLine matches /^\d+$/ which can eat real ages;
      // we guard that here so ages (which are also all-digit) are never skipped.
      i++;
      continue;
    }

    if (looksLikeSetApartToken(line)) {
      i++;
      continue;
    }

    // Inline "Last, First M" record (single line, no separate column dump)
    const inlineNameGender = parseInlineNameGender(line);
    if (inlineNameGender) {
      i++;
      // Skip age if present
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

    // Column-dump name-block
    if (looksLikeMemberNameStart(line)) {
      // Collect all names
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

      // Collect all genders
      const genders: string[] = [];
      while (i < n && looksLikeGenderLine(normalizeWhitespace(lines[i]))) {
        genders.push(lines[i]);
        i++;
      }

      if (names.length !== genders.length) continue;

      // Parse data rows — one age per row (ages may batch for multi-calling members)
      let rowIdx = 0;
      while (rowIdx < names.length && i < n) {
        // Collect consecutive ages (batch)
        const ageBatch: number[] = [];
        while (i < n && looksLikeAgeLine(normalizeWhitespace(lines[i]))) {
          ageBatch.push(Number(normalizeWhitespace(lines[i])));
          i++;
        }
        if (ageBatch.length === 0) break;

        // Parse one data row per age in the batch
        for (let _age of ageBatch) {
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

      // Skip any trailing set-apart tokens at end of block
      while (i < n && looksLikeSetApartToken(normalizeWhitespace(lines[i]))) i++;
      continue;
    }

    i++;
  }

  return callings;
}

/**
 * Detect whether the raw text looks like an LCR column-dump format.
 * Heuristic: find a name-start line followed (within 20 lines, after skipping
 * headers/footers) by a block of gender tokens.
 */
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

export function parseCallingsPdfText(rawText: string): ParsedCalling[] {
  const lines = rawText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let callings: ParsedCalling[];

  if (looksLikeColumnDumpFormat(lines)) {
    callings = parsePdfCallingsColumnDump(lines);
  } else {
    // Fall back to original parsers for non-column-dump PDFs
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
