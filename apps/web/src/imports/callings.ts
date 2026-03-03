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

import { normalizeWhitespace, isHeaderOrFooterLine } from './pdf-cleanup';

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

function looksLikeNameLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  // Name lines contain a comma and some letters, but no leading digits
  return /,/.test(normalized) && /[a-z]/i.test(normalized) && !/^\d/.test(normalized);
}

function looksLikeGenderLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  return /^(m|f|male|female)$/i.test(normalized);
}

function looksLikeAgeLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  return /^\d{1,3}$/i.test(normalized);
}

function looksLikeBirthdayLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  // Birthday: dd Mmm yyyy or dd Mmm
  return /^\d{1,2}\s+[a-z]{3,}(\s+\d{4})?$/i.test(normalized);
}

function looksLikeSustainedDateLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  // Sustained date: dd Mmm yyyy
  return /^\d{1,2}\s+[a-z]{3,}\s+\d{4}$/i.test(normalized);
}

function looksLikeSetApartLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  // Just a checkmark
  return /^✔$/i.test(normalized) || /^✓$/i.test(normalized);
}

function findBestOrganizationMatch(text: string): { org: string; remaining: string } | null {
  const normalized = normalizeWhitespace(text);
  
  // Try to find the longest matching organization from known list
  let bestMatch: string | null = null;
  let bestMatchLength = 0;
  
  for (const org of KNOWN_ORGANIZATIONS) {
    const orgLower = org.toLowerCase();
    const textLower = normalized.toLowerCase();
    
    if (textLower.startsWith(orgLower)) {
      if (org.length > bestMatchLength) {
        bestMatch = org;
        bestMatchLength = org.length;
      }
    }
  }
  
  if (bestMatch) {
    const remaining = normalized.substring(bestMatch.length).trim();
    return { org: bestMatch, remaining };
  }
  
  return null;
}

function parsePdfCallingsTableFormatSingleSpace(line: string): ParsedCalling | null {
  const normalized = normalizeWhitespace(line);
  
  if (!looksLikeNameLine(normalized)) return null;
  
  const tokens = normalized.split(/\s+/);
  if (tokens.length < 8) return null; // Minimum: name, gender, age, bd-day, bd-month, bd-year, org, calling
  
  // Extract name (everything before first M/F token)
  let nameEndIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (/^[MF]$/i.test(tokens[i])) {
      nameEndIdx = i;
      break;
    }
  }
  
  if (nameEndIdx === -1 || nameEndIdx === 0) return null;
  
  const name = tokens.slice(0, nameEndIdx).join(' ');
  let idx = nameEndIdx;
  
  // Gender
  const gender = tokens[idx++];
  
  // Age
  if (idx >= tokens.length || !/^\d+$/.test(tokens[idx])) return null;
  idx++; // skip age
  
  // Birthday: dd Mmm yyyy
  if (idx + 2 >= tokens.length) return null;
  const birthdayStr = `${tokens[idx]} ${tokens[idx + 1]} ${tokens[idx + 2]}`;
  const birthday = normalizeBirthday(birthdayStr);
  idx += 3;
  
  // Find organization
  const remainingTokens = tokens.slice(idx);
  const remainingText = remainingTokens.join(' ');
  
  const orgMatch = findBestOrganizationMatch(remainingText);
  if (!orgMatch) return null;
  
  const organization = orgMatch.org;
  let callingAndFlags = orgMatch.remaining;
  
  // Check for set apart checkmark at end
  let setApart = false;
  if (/[✔✓]$/.test(callingAndFlags)) {
    setApart = true;
    callingAndFlags = callingAndFlags.replace(/[✔✓]$/, '').trim();
  }
  
  // Check for sustained date at end (dd Mmm yyyy)
  let sustained = false;
  const sustainedMatch = callingAndFlags.match(/^(.+?)\s+\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}\s*$/);
  if (sustainedMatch) {
    sustained = true;
    callingAndFlags = sustainedMatch[1].trim();
  }
  
  const callingName = callingAndFlags;
  if (!callingName) return null;
  
  return {
    memberName: name,
    birthday,
    organization,
    callingName,
    sustained,
    setApart
  };
}

// Parse TABLE FORMAT from PDFs where each calling is on one line with space-separated columns:
// Format: Name Gender Age Birthday Organization Calling [Sustained] [SetApart]
// Example: Acosta, Frank M 65 26 May 1960 Elders Quorum Elders Quorum Secretary 9 Mar 2025 ✔
function parsePdfCallingsTableFormat(lines: string[]): ParsedCalling[] {
  const callings: ParsedCalling[] = [];

  for (const line of lines) {
    // Skip header/footer lines
    if (isHeaderOrFooterLine(line)) {
      continue;
    }

    const normalized = normalizeWhitespace(line);
    
    // Check if line starts with a name (contains comma)
    if (!looksLikeNameLine(normalized)) {
      continue;
    }

    // Parse the line by splitting on multiple spaces (2+)
    // This preserves multi-word values that are single-space separated
    const parts = normalized.split(/\s{2,}/);
    
     if (parts.length >= 5) {
      // Extract fixed columns: Name, Gender, Age, Birthday (4 parts of birthday: day month year)
      let currentIndex = 0;
      const name = parts[currentIndex++];
      
      if (currentIndex >= parts.length) continue;
      const genderStr = parts[currentIndex++];
      
      if (currentIndex >= parts.length) continue;
      const ageStr = parts[currentIndex++];
      
      // Birthday: next 3 tokens are day, month, year
      if (currentIndex >= parts.length) continue;
      const birthdayPart = parts[currentIndex++];
      
      // Birthday might be in the same column or split across columns
      // Try to extract "dd Mmm yyyy" pattern
      const birthdayMatch = birthdayPart.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
      let birthday: string;
      
      if (birthdayMatch) {
        birthday = normalizeBirthday(`${birthdayMatch[1]} ${birthdayMatch[2]} ${birthdayMatch[3]}`);
      } else {
        // Birthday might be split, try combining with next parts
        const birthdayStr = [birthdayPart, parts[currentIndex], parts[currentIndex + 1]].join(' ');
        const match2 = birthdayStr.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
        if (match2) {
          birthday = normalizeBirthday(`${match2[1]} ${match2[2]} ${match2[3]}`);
          currentIndex += 2; // consumed 2 more parts
        } else {
          // Can't parse birthday, skip
          continue;
        }
      }
  
      // Now we need to find Organization and Calling from remaining parts
      // Organization is from KNOWN_ORGANIZATIONS list
      // Everything after organization (until date or checkmark) is the calling
      
      const remainingParts = parts.slice(currentIndex);
      if (remainingParts.length === 0) continue;
      
      const remainingText = remainingParts.join(' ');
      
      // Find organization
      const orgMatch = findBestOrganizationMatch(remainingText);
      if (!orgMatch) continue;
      
      const organization = orgMatch.org;
      let remainingAfterOrg = orgMatch.remaining;
      
      // Now parse calling, sustained date, and set apart
      // Look for sustained date pattern (dd Mmm yyyy) and checkmark at the end
      let sustained = false;
      let setApart = false;
      
      // Check if last token is checkmark
      if (remainingAfterOrg.endsWith('✔') || remainingAfterOrg.endsWith('✓')) {
        setApart = true;
        remainingAfterOrg = remainingAfterOrg.slice(0, -1).trim();
      }
      
      // Check if there's a sustained date at the end (dd Mmm yyyy)
      const sustainedMatch = remainingAfterOrg.match(/(.+?)\s+(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\s*$/);
      if (sustainedMatch) {
        sustained = true;
        remainingAfterOrg = sustainedMatch[1].trim();
      }
      
      const callingName = remainingAfterOrg;
      
      if (!callingName) continue;
  
      callings.push({
        memberName: name,
        birthday,
        organization,
        callingName,
        sustained,
        setApart
      });
     } else {
      // Fallback: try single-space token parser
      const parsed = parsePdfCallingsTableFormatSingleSpace(line);
      if (parsed) {
        callings.push(parsed);
      }
    }
  }

  return callings;
}

// Parse MULTI-LINE FORMAT where calling records span multiple lines:
// Line 1: Name (Last, First Middle)
// Line 2: Gender (M or F)
// Line 3: Age (number)
// Line 4: Birthday (dd Mmm yyyy)
// Line 5+: Organization + Calling (multiple lines, need to split)
// Optional: Sustained date (dd Mmm yyyy)
// Optional: Set Apart checkmark (✔)
function parsePdfCallingsMultiLine(lines: string[]): ParsedCalling[] {
  const callings: ParsedCalling[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    // Skip header/footer lines
    if (isHeaderOrFooterLine(line)) {
      i++;
      continue;
    }

    // Check if this looks like the start of a calling record (name line)
    if (!looksLikeNameLine(line)) {
      i++;
      continue;
    }

    const name = normalizeWhitespace(line);
    i++;

    // Next line should be gender
    if (i >= lines.length) break;
    let nextLine = lines[i];
    
    // Skip any header/footer
    while (i < lines.length && isHeaderOrFooterLine(nextLine)) {
      i++;
      if (i >= lines.length) break;
      nextLine = lines[i];
    }
    
    if (i >= lines.length || !looksLikeGenderLine(nextLine)) {
      continue;
    }
    i++; // consume gender

    // Next line should be age
    if (i >= lines.length) break;
    nextLine = lines[i];
    
    while (i < lines.length && isHeaderOrFooterLine(nextLine)) {
      i++;
      if (i >= lines.length) break;
      nextLine = lines[i];
    }
    
    if (i >= lines.length || !looksLikeAgeLine(nextLine)) {
      continue;
    }
    i++; // consume age

    // Next line should be birthday
    if (i >= lines.length) break;
    nextLine = lines[i];
    
    while (i < lines.length && isHeaderOrFooterLine(nextLine)) {
      i++;
      if (i >= lines.length) break;
      nextLine = lines[i];
    }
    
    if (i >= lines.length || !looksLikeBirthdayLine(nextLine)) {
      continue;
    }
    
    const birthday = normalizeBirthday(nextLine);
    i++;

    // Now collect organization + calling lines
    const orgCallingLines: string[] = [];
    
    while (i < lines.length) {
      nextLine = lines[i];
      
      if (isHeaderOrFooterLine(nextLine)) {
        i++;
        continue;
      }
      
      if (looksLikeNameLine(nextLine)) {
        break;
      }
      
      if (looksLikeSustainedDateLine(nextLine)) {
        break;
      }
      
      if (looksLikeSetApartLine(nextLine)) {
        break;
      }
      
      orgCallingLines.push(normalizeWhitespace(nextLine));
      i++;
    }
    
    if (orgCallingLines.length === 0) {
      continue;
    }
    
    const orgCallingText = orgCallingLines.join(' ');
    const match = findBestOrganizationMatch(orgCallingText);
    
    if (!match) {
      continue;
    }
    
    const organization = match.org;
    const callingName = match.remaining;
    
    if (!callingName) {
      continue;
    }
    
    // Check for optional sustained date
    let sustained = false;
    if (i < lines.length) {
      nextLine = lines[i];
      
      while (i < lines.length && isHeaderOrFooterLine(nextLine)) {
        i++;
        if (i >= lines.length) break;
        nextLine = lines[i];
      }
      
      if (i < lines.length && looksLikeSustainedDateLine(nextLine)) {
        sustained = true;
        i++;
      }
    }
    
    // Check for optional set apart checkmark
    let setApart = false;
    if (i < lines.length) {
      nextLine = lines[i];
      
      while (i < lines.length && isHeaderOrFooterLine(nextLine)) {
        i++;
        if (i >= lines.length) break;
        nextLine = lines[i];
      }
      
      if (i < lines.length && looksLikeSetApartLine(nextLine)) {
        setApart = true;
        i++;
      }
    }

    callings.push({
      memberName: name,
      birthday,
      organization,
      callingName,
      sustained,
      setApart
    });
  }

  return callings;
}

export function parseCallingsPdfText(rawText: string): ParsedCalling[] {
  const normalized = rawText.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Detect format: Table format vs Multi-line format
  // Table format: Name and other data on same line
  // Multi-line format: Name on one line, gender on next, etc.
  
  let isTableFormat = false;
  let isMultiLineFormat = false;
  
  // Check for table format: lines with comma followed by M/F/gender and age on same line
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i];
    if (isHeaderOrFooterLine(line)) continue;
    
    // Table format: "Name, M Age Birthday..."
    if (/,\s*[^,]+\s+[MF]\s+\d{1,3}\s+\d{1,2}\s+[A-Za-z]{3,}/i.test(line)) {
      isTableFormat = true;
      break;
    }
  }
  
  // Check for multi-line format: name, gender, age, birthday in sequence
  if (!isTableFormat) {
    for (let i = 0; i < Math.min(lines.length - 3, 50); i++) {
      if (looksLikeNameLine(lines[i]) && 
          i + 1 < lines.length && looksLikeGenderLine(lines[i + 1]) &&
          i + 2 < lines.length && looksLikeAgeLine(lines[i + 2]) &&
          i + 3 < lines.length && looksLikeBirthdayLine(lines[i + 3])) {
        isMultiLineFormat = true;
        break;
      }
    }
  }
  
  let callings: ParsedCalling[] = [];
  
  if (isTableFormat) {
    callings = parsePdfCallingsTableFormat(lines);
  } else if (isMultiLineFormat) {
    callings = parsePdfCallingsMultiLine(lines);
  }
  
  // Deduplicate
  const deduped = new Map<string, ParsedCalling>();
  for (const calling of callings) {
    const key = `${calling.memberName.toLowerCase()}::${calling.birthday.toLowerCase()}::${calling.callingName.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, calling);
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
