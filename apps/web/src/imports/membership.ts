export type ParsedMember = {
  fullName: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  birthday: string | null;
  gender: string | null;
};

const HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
};

export function toPlainText(input: string): string {
  let output = input;

  output = output.replace(/<br\s*\/?\s*>/gi, '\n');
  output = output.replace(/<\/p\s*>/gi, '\n');
  output = output.replace(/<[^>]+>/g, ' ');

  for (const [entity, value] of Object.entries(HTML_ENTITY_MAP)) {
    output = output.replaceAll(entity, value);
  }

  output = output.replace(/\r\n?/g, '\n');

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

import { normalizeWhitespace, isHeaderOrFooterLine } from './pdf-cleanup';

function sanitizePhone(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  // Remove common non-phone patterns
  if (normalized.length === 0) return null;
  if (normalized === ',') return null; // Reject lone commas
  if (/^\d+$/.test(normalized) && normalized.length < 7) return null; // Too short to be phone
  return normalized.length ? normalized : null;
}

function sanitizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized.includes('@') ? normalized : null;
}

function normalizeBirthday(value: string): string | null {
  const raw = normalizeWhitespace(value);
  if (!raw) return null;

  // Matches: "26 May 1994" or "26 Mar 1994" (day month year) - LCR format
  const dmy = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s*(\d{4})?$/);
  if (dmy) {
    const day = String(Number(dmy[1])); // strips leading zero
    const month = dmy[2];
    const year = dmy[3];
    // Store as "May 26 1994" or just "May 26" if no year
    return year ? `${month} ${day} ${year}` : `${month} ${day}`;
  }

  // Already in "May 26" or "May 26 1994" style → keep it
  const mdy = raw.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (mdy) {
    const month = mdy[1];
    const day = String(Number(mdy[2]));
    const year = mdy[3];
    return year ? `${month} ${day} ${year}` : `${month} ${day}`;
  }

  return raw;
}

type FieldMapping = 'name' | 'email' | 'phone' | 'age' | 'birthday' | 'gender' | 'unknown';

type Delimiter = 'tab' | 'pipe' | 'comma' | 'multispace' | 'single_space';

function detectDelimiter(line: string): Delimiter {
  if (line.includes('\t')) return 'tab';
  if (/\s\|\s|\|/.test(line)) return 'pipe';
  // Check for multiple spaces (common in PDF extraction)
  if (/\s{2,}/.test(line)) return 'multispace';
  if (line.includes(',')) return 'comma';
  return 'single_space';
}

function splitLine(line: string, delimiter: Delimiter): string[] {
  switch (delimiter) {
    case 'tab':
      return line.split('\t');
    case 'pipe':
      return line.split(/\s*\|\s*/);
    case 'multispace':
      return line.split(/\s{2,}/);
    case 'comma':
      return line.split(/\s*,\s*/);
    case 'single_space':
      return line.split(/\s+/);
  }
}

const HEADER_PATTERNS: Record<FieldMapping, RegExp> = {
  name: /^(full\s*name|name|member\s*name|preferred\s*name)$/i,
  email: /^(e[\s-]*mail|email\s*address)$/i,
  phone: /^(phone|phone\s*number|telephone|cell|mobile)$/i,
  age: /^(age)$/i,
  birthday: /^(birthday|birth\s*date|date\s*of\s*birth|dob|birthdate)$/i,
  gender: /^(gender|sex)$/i,
  unknown: /(?!)/
};

function detectHeaderMapping(parts: string[]): FieldMapping[] | null {
  const mappings: FieldMapping[] = [];
  let headerFieldCount = 0;

  for (const part of parts) {
    let matched: FieldMapping = 'unknown';
    for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
      if (field === 'unknown') continue;
      if (pattern.test(part)) {
        matched = field as FieldMapping;
        headerFieldCount++;
        break;
      }
    }
    mappings.push(matched);
  }

  // Consider it a header row if at least 2 fields matched known header names,
  // or if the first field matches "name" (most common minimal header)
  if (headerFieldCount >= 2 || (headerFieldCount >= 1 && mappings[0] === 'name')) {
    return mappings;
  }

  return null;
}

function parseAge(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 150) return null;
  return parsed;
}

function parseGenderPdf(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  // Normalize to single letter for PDF format
  if (trimmed === 'MALE' || trimmed === 'M') return 'M';
  if (trimmed === 'FEMALE' || trimmed === 'F') return 'F';
  return trimmed;
}

function parseGenderLegacy(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Keep as-is for legacy CSV/TSV format to preserve "Male"/"Female"
  return trimmed;
}

function parseMemberFromMapping(parts: string[], mapping: FieldMapping[]): ParsedMember | null {
  let fullName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let age: number | null = null;
  let birthday: string | null = null;
  let gender: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const field = i < mapping.length ? mapping[i] : 'unknown';
    const value = parts[i];

    switch (field) {
      case 'name':
        if (value) fullName = value;
        break;
      case 'email':
        email = sanitizeEmail(value);
        break;
      case 'phone':
        phone = sanitizePhone(value);
        break;
      case 'age':
        age = parseAge(value);
        break;
      case 'birthday':
        birthday = normalizeBirthday(value);
        break;
      case 'gender':
        gender = parseGenderLegacy(value);
        break;
      case 'unknown':
        // Try to infer unknown columns by content
        if (!email && value.includes('@')) {
          email = sanitizeEmail(value);
        } else if (!phone && /\d{3}[\s\-.]?\d{3}[\s\-.]?\d{4}/.test(value)) {
          phone = sanitizePhone(value);
        } else if (!fullName) {
          fullName = value;
        }
        break;
    }
  }

  if (!fullName) return null;

  return { fullName, email, phone, age, birthday, gender };
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

function looksLikeAgeBirthdayLine(line: string): boolean {
  const normalized = normalizeWhitespace(line);
  // Starts with age (number), followed by date pattern (dd Mmm yyyy or dd Mmm)
  return /^\d{1,3}\s+\d{1,2}\s+[a-z]{3,}/i.test(normalized);
}

// Parse LCR PDF format where records span multiple lines:
// Line 1: Name (Last, First Middle)
// Line 2: Gender (M or F)
// Line 3: Age dd Mmm yyyy [phone]
// Line 4 (optional): email
function parsePdfMembersMultiLine(lines: string[]): ParsedMember[] {
  const members: ParsedMember[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    // Skip header/footer lines
    if (isHeaderOrFooterLine(line)) {
      i++;
      continue;
    }

    // Check if this looks like the start of a member record
    if (!looksLikeNameLine(line)) {
      i++;
      continue;
    }

    const name = normalizeWhitespace(line);
    i++;

    // Next line should be gender
    if (i >= lines.length) break;
    let nextLine = lines[i];
    
    // Skip any header/footer that snuck in
    while (i < lines.length && isHeaderOrFooterLine(nextLine)) {
      i++;
      nextLine = lines[i];
    }
    
    if (i >= lines.length || !looksLikeGenderLine(nextLine)) {
      // Not a valid record, continue
      continue;
    }

    const gender = parseGenderPdf(nextLine);
    i++;

    // Next line should be age + birthday + optional phone
    if (i >= lines.length) break;
    nextLine = lines[i];
    
    // Skip any header/footer
    while (i < lines.length && isHeaderOrFooterLine(nextLine)) {
      i++;
      nextLine = lines[i];
    }
    
    if (i >= lines.length || !looksLikeAgeBirthdayLine(nextLine)) {
      // Not a valid record
      continue;
    }

    const ageBirthdayPhoneLine = normalizeWhitespace(nextLine);
    const parts = ageBirthdayPhoneLine.split(/\s+/);
    
    // Parse: age dd Mmm yyyy [phone]
    // Minimum is 4 parts: age, day, month, year
    if (parts.length < 4) {
      i++;
      continue;
    }

    const ageStr = parts[0];
    const age = parseAge(ageStr);
    
    // Birthday is next 3 parts: dd Mmm yyyy
    const birthdayStr = `${parts[1]} ${parts[2]} ${parts[3]}`;
    const birthday = normalizeBirthday(birthdayStr);
    
    // Phone is remaining parts (if any)
    const phone = parts.length > 4 ? sanitizePhone(parts.slice(4).join(' ')) : null;
    
    i++;

    // Next line might be email (or might be the next name)
    let email: string | null = null;
    if (i < lines.length) {
      nextLine = lines[i];
      
      // Skip headers/footers
      while (i < lines.length && isHeaderOrFooterLine(nextLine)) {
        i++;
        nextLine = lines[i];
      }
      
      if (i < lines.length && nextLine.includes('@') && !looksLikeNameLine(nextLine)) {
        email = sanitizeEmail(nextLine);
        i++;
      }
    }

    // We have a complete member record
    members.push({
      fullName: name,
      gender,
      age,
      birthday,
      phone,
      email
    });
  }

  return members;
}

function parseMemberLegacy(parts: string[]): ParsedMember | null {
  if (!parts.length) return null;

  const fullName = parts[0];
  let email: string | null = null;
  let phone: string | null = null;

  for (const part of parts.slice(1)) {
    if (!email && part.includes('@')) {
      email = sanitizeEmail(part);
      continue;
    }

    if (!phone) {
      phone = sanitizePhone(part);
    }
  }

  return { fullName, email, phone, age: null, birthday: null, gender: null };
}

export function parseMembershipText(rawText: string): ParsedMember[] {
  const plainText = toPlainText(rawText);
  if (!plainText) {
    return [];
  }

  const lines = plainText.split('\n');
  if (!lines.length) {
    return [];
  }

  // Check if this looks like LCR PDF text (multi-line format)
  // Look for the pattern: name line with comma, followed by M/F, followed by age+date
  let isPdfFormat = false;
  for (let i = 0; i < Math.min(lines.length - 2, 50); i++) {
    if (looksLikeNameLine(lines[i]) && 
        i + 1 < lines.length && looksLikeGenderLine(lines[i + 1]) &&
        i + 2 < lines.length && looksLikeAgeBirthdayLine(lines[i + 2])) {
      isPdfFormat = true;
      break;
    }
  }

  if (isPdfFormat) {
    // Use multi-line PDF parser
    const members = parsePdfMembersMultiLine(lines);
    
    // Deduplicate by name
    const deduped = new Map<string, ParsedMember>();
    for (const member of members) {
      const existing = deduped.get(member.fullName.toLowerCase());
      if (existing) {
        deduped.set(member.fullName.toLowerCase(), {
          fullName: member.fullName,
          email: member.email ?? existing.email,
          phone: member.phone ?? existing.phone,
          age: member.age ?? existing.age,
          birthday: member.birthday ?? existing.birthday,
          gender: member.gender ?? existing.gender
        });
      } else {
        deduped.set(member.fullName.toLowerCase(), member);
      }
    }
    
    return Array.from(deduped.values());
  } else {
    // Use legacy CSV/TSV parser
    const deduped = new Map<string, ParsedMember>();
    const delimiter = detectDelimiter(lines[0]);

    const firstLineParts = splitLine(lines[0], delimiter)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    const headerMapping = detectHeaderMapping(firstLineParts);
    const startIndex = headerMapping ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      // When using header mapping, preserve empty fields to maintain column alignment
      const parts = headerMapping
        ? splitLine(lines[i], delimiter).map((part) => part.trim())
        : splitLine(lines[i], detectDelimiter(lines[i]))
            .map((part) => part.trim())
            .filter((part) => part.length > 0);

      if (!parts.length || (headerMapping && parts.every((p) => !p))) {
        continue;
      }

      const parsed = headerMapping ? parseMemberFromMapping(parts, headerMapping) : parseMemberLegacy(parts);

      if (!parsed) continue;

      const existing = deduped.get(parsed.fullName.toLowerCase());
      if (existing) {
        deduped.set(parsed.fullName.toLowerCase(), {
          fullName: parsed.fullName,
          email: parsed.email ?? existing.email,
          phone: parsed.phone ?? existing.phone,
          age: parsed.age ?? existing.age,
          birthday: parsed.birthday ?? existing.birthday,
          gender: parsed.gender ?? existing.gender
        });
        continue;
      }

      deduped.set(parsed.fullName.toLowerCase(), parsed);
    }
    
    return Array.from(deduped.values());
  }
}
