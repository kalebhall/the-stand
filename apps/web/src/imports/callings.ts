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

function isHeaderOrFooterLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  
  // Single-word header lines (LCR PDF splits headers across lines)
  if (/^name$/i.test(normalized)) return true;
  if (/^gender$/i.test(normalized)) return true;
  if (/^age$/i.test(normalized)) return true;
  if (/^birth\s*date$/i.test(normalized)) return true;
  if (/^organization$/i.test(normalized)) return true;
  if (/^calling$/i.test(normalized)) return true;
  if (/^sustained$/i.test(normalized)) return true;
  if (/^set\s*apart$/i.test(normalized)) return true;
  
  // Combined header patterns (in case they're on one line)
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

// Parse LCR PDF format where calling records span multiple lines:
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
    // Keep reading until we hit:
    // - A sustained date line (dd Mmm yyyy)
    // - A set apart checkmark (✔)
    // - A new name line
    // - End of file
    const orgCallingLines: string[] = [];
    
    while (i < lines.length) {
      nextLine = lines[i];
      
      if (isHeaderOrFooterLine(nextLine)) {
        i++;
        continue;
      }
      
      if (looksLikeNameLine(nextLine)) {
        // Start of next record
        break;
      }
      
      if (looksLikeSustainedDateLine(nextLine)) {
        // Found sustained date, stop collecting org/calling
        break;
      }
      
      if (looksLikeSetApartLine(nextLine)) {
        // Found set apart marker, stop collecting org/calling
        break;
      }
      
      // Add to org/calling text
      orgCallingLines.push(normalizeWhitespace(nextLine));
      i++;
    }
    
    if (orgCallingLines.length === 0) {
      // No org/calling found, skip this record
      continue;
    }
    
    // Combine org/calling lines and split into org + calling
    const orgCallingText = orgCallingLines.join(' ');
    const match = findBestOrganizationMatch(orgCallingText);
    
    if (!match) {
      // Couldn't find organization, skip
      continue;
    }
    
    const organization = match.org;
    const callingName = match.remaining;
    
    if (!callingName) {
      // No calling name, skip
      continue;
    }
    
    // Now check for optional sustained date
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
    
    // Now check for optional set apart checkmark
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

    // We have a complete calling record
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
  
  // Check if this looks like LCR PDF format (multi-line)
  // Look for the pattern: name, gender, age, birthday in sequence
  let isPdfFormat = false;
  for (let i = 0; i < Math.min(lines.length - 3, 50); i++) {
    if (looksLikeNameLine(lines[i]) && 
        i + 1 < lines.length && looksLikeGenderLine(lines[i + 1]) &&
        i + 2 < lines.length && looksLikeAgeLine(lines[i + 2]) &&
        i + 3 < lines.length && looksLikeBirthdayLine(lines[i + 3])) {
      isPdfFormat = true;
      break;
    }
  }
  
  if (isPdfFormat) {
    const callings = parsePdfCallingsMultiLine(lines);
    
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
  
  // Fall back to legacy parser (not implemented here, would need original logic)
  // For now, return empty if not PDF format
  return [];
}

export function makeMemberBirthdayKey(memberName: string, birthday: string): string {
  return `${memberName.replace(/\s+/g, ' ').trim().toLowerCase()}::${normalizeBirthday(birthday)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()}`;
}
