import { isHeaderOrFooterLine, normalizeWhitespace } from './pdf-cleanup';

export type ParsedCalling = {
  memberName: string;
  birthday: string;
  organization: string;
  callingName: string;
  sustained: boolean;
  setApart: boolean;
};

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
  'Other Callings'
];

const SET_APART_TOKEN_PATTERN = /^(?:[\u2713\u2714]|âœ”|âœ“|Ã¢Å“â€|Ã¢Å“â€œ)$/;
const SUSTAINED_DATE_PATTERN = /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}$/;

function normalizeBirthday(input: string): string {
  const raw = normalizeWhitespace(input);
  if (!raw) return raw;

  const dmy = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s*(\d{4})?$/);
  if (dmy) return `${dmy[2]} ${String(Number(dmy[1]))}`;

  const mdy = raw.match(/^([A-Za-z]{3,})\s+(\d{1,2})$/);
  if (mdy) return `${mdy[1]} ${String(Number(mdy[2]))}`;

  return raw;
}

function looksLikeNameLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  return /,/.test(normalized) && /[a-z]/i.test(normalized) && !/^\d/.test(normalized);
}

function looksLikeGenderLine(line: string): boolean {
  return /^(m|f|male|female)$/i.test(normalizeWhitespace(line));
}

function looksLikeAgeLine(line: string): boolean {
  return /^\d{1,3}$/i.test(normalizeWhitespace(line));
}

function looksLikeBirthdayLine(line: string): boolean {
  return /^\d{1,2}\s+[a-z]{3,}(\s+\d{4})?$/i.test(normalizeWhitespace(line));
}

function looksLikeSustainedDateLine(line: string): boolean {
  return SUSTAINED_DATE_PATTERN.test(normalizeWhitespace(line));
}

function looksLikeSetApartToken(line: string): boolean {
  return SET_APART_TOKEN_PATTERN.test(normalizeWhitespace(line));
}

function stripTrailingSetApartToken(value: string): { value: string; setApart: boolean } {
  const normalized = normalizeWhitespace(value);
  const stripped = normalized.replace(/(?:\s|^)(?:[\u2713\u2714]|âœ”|âœ“|Ã¢Å“â€|Ã¢Å“â€œ)\s*$/, '').trim();
  return { value: stripped, setApart: stripped.length !== normalized.length };
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

function finalizeCallingFields(raw: string): { callingName: string; sustained: boolean; setApart: boolean } | null {
  let callingText = normalizeWhitespace(raw);
  if (!callingText) return null;

  const setApartStrip = stripTrailingSetApartToken(callingText);
  let setApart = setApartStrip.setApart;
  callingText = setApartStrip.value;

  let sustained = false;
  const sustainedMatch = callingText.match(/^(.+?)\s*(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\s*$/);
  if (sustainedMatch) {
    sustained = true;
    callingText = sustainedMatch[1].trim();
  }

  if (!callingText) return null;
  return { callingName: callingText, sustained, setApart };
}

function parseSpacedTableLine(line: string): ParsedCalling | null {
  const normalized = normalizeWhitespace(line);
  if (!looksLikeNameLine(normalized)) return null;

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

  if (idx + 2 >= tokens.length) return null;
  const birthday = normalizeBirthday(`${tokens[idx]} ${tokens[idx + 1]} ${tokens[idx + 2]}`);
  idx += 3;

  const orgMatch = findBestOrganizationMatch(tokens.slice(idx).join(' '));
  if (!orgMatch) return null;
  const finalized = finalizeCallingFields(orgMatch.remaining);
  if (!finalized) return null;

  return {
    memberName,
    birthday,
    organization: orgMatch.org,
    callingName: finalized.callingName,
    sustained: finalized.sustained,
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
    sustained: finalized.sustained,
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
      if (isHeaderOrFooterLine(nextLine)) {
        i++;
        continue;
      }
      if (looksLikeSetApartToken(nextLine)) {
        parsed.setApart = true;
        i++;
        continue;
      }
      if (looksLikeSustainedDateLine(nextLine)) {
        parsed.sustained = true;
        i++;
        continue;
      }
      if (parseTableLine(nextLine) || looksLikeNameLine(nextLine)) break;

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

    let sustained = finalized.sustained;
    let setApart = finalized.setApart;

    if (i < lines.length && looksLikeSustainedDateLine(lines[i])) {
      sustained = true;
      i++;
    }
    if (i < lines.length && looksLikeSetApartToken(lines[i])) {
      setApart = true;
      i++;
    }

    callings.push({
      memberName,
      birthday,
      organization: orgMatch.org,
      callingName: finalized.callingName,
      sustained,
      setApart
    });
  }

  return callings;
}

export function parseCallingsPdfText(rawText: string): ParsedCalling[] {
  const lines = rawText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let tableLike = false;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    if (isHeaderOrFooterLine(lines[i])) continue;
    if (parseTableLine(lines[i])) {
      tableLike = true;
      break;
    }
  }

  let callings: ParsedCalling[];
  if (tableLike) {
    callings = parsePdfCallingsTableFormat(lines);
  } else {
    callings = parsePdfCallingsMultiLine(lines);
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
