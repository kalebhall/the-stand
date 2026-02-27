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

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
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

// Parse LCR PDF format: Name Gender Age Birth Date Phone Number E-mail
function parsePdfMemberLine(line: string): ParsedMember | null {
  const normalized = normalizeWhitespace(line);
  
  // Skip header and footer lines
  if (/^name\s+gender\s+age\s+birth\s+date/i.test(normalized)) return null;
  if (/^member\s+list/i.test(normalized)) return null;
  if (/^individuals$/i.test(normalized)) return null;
  if (/^freedom\s+park\s+ward/i.test(normalized)) return null;
  if (/^las\s+vegas\s+nevada/i.test(normalized)) return null;
  if (/^for\s+church\s+use\s+only/i.test(normalized)) return null;
  if (/^\d+\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$/i.test(normalized)) return null;

  // Use single space delimiter for PDF text since pdf-parse just outputs plain text with single spaces
  const parts = splitLine(line, 'single_space').map((p) => p.trim()).filter(Boolean);
  
  if (parts.length < 4) return null;

  // Since it's split by single spaces, the name could be multiple tokens (e.g. "Acosta, Frank")
  // Find where the gender and age are
  let genderIdx = -1;
  for (let i = 1; i < parts.length - 1; i++) {
    const isGender = /^(m|f|male|female)$/i.test(parts[i]!);
    const isAge = /^\d+$/.test(parts[i+1]!);
    if (isGender && isAge) {
      genderIdx = i;
      break;
    }
  }

  if (genderIdx === -1) return null;

  const name = parts.slice(0, genderIdx).join(' ');
  const genderRaw = parts[genderIdx]!;
  const ageRaw = parts[genderIdx + 1]!;

  const gender = parseGenderPdf(genderRaw);
  const age = parseAge(ageRaw);
  
  // Next field should be birthday
  const rest = parts.slice(genderIdx + 2);
  if (rest.length === 0) return null;
  
  // Birthday can be 1-3 tokens: "26 May 1994" or "26 May" or "May 26"
  let birthday: string | null = null;
  let remainingIdx = 0;
  
  // Try parsing as "26 May 1994" (3 tokens)
  if (rest.length >= 3 && /^\d{1,2}$/.test(rest[0] ?? '') && /^[A-Za-z]{3,}$/.test(rest[1] ?? '')) {
    const day = rest[0];
    const month = rest[1];
    const yearOrNext = rest[2];
    
    if (/^\d{4}$/.test(yearOrNext ?? '')) {
      birthday = normalizeBirthday(`${day} ${month} ${yearOrNext}`);
      remainingIdx = 3;
    } else {
      birthday = normalizeBirthday(`${day} ${month}`);
      remainingIdx = 2;
    }
  }
  // Try "26 May" (2 tokens)
  else if (rest.length >= 2 && /^\d{1,2}$/.test(rest[0] ?? '') && /^[A-Za-z]{3,}$/.test(rest[1] ?? '')) {
    birthday = normalizeBirthday(`${rest[0]} ${rest[1]}`);
    remainingIdx = 2;
  }
  // Try "May 26" format
  else if (rest.length >= 2 && /^[A-Za-z]{3,}$/.test(rest[0] ?? '') && /^\d{1,2}$/.test(rest[1] ?? '')) {
    birthday = normalizeBirthday(`${rest[0]} ${rest[1]}`);
    remainingIdx = 2;
  }
  
  if (!birthday) return null;
  
  // Remaining tokens are phone and/or email
  const remaining = rest.slice(remainingIdx);
  let phone: string | null = null;
  let email: string | null = null;
  
  for (const token of remaining) {
    if (!email && token.includes('@')) {
      email = sanitizeEmail(token);
    } else if (!phone && /\d/.test(token)) {
      phone = sanitizePhone(token);
    }
  }
  
  return {
    fullName: name,
    gender,
    age,
    birthday,
    phone,
    email
  };
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

  const deduped = new Map<string, ParsedMember>();

  // Check if this looks like PDF text (has the M/F pattern with age numbers after it)
  // pdf-parse might just use single spaces, so we check for the pattern "Name M 65" or "Name F 45"
  const isPdfFormat = lines.some((line) => /\b(m|f|male|female)\s+\d{1,3}\b/i.test(line) || /\s{2,}/.test(line));

  if (isPdfFormat) {
    // Use PDF parser
    for (const line of lines) {
      const parsed = parsePdfMemberLine(line);
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
  } else {
    // Use legacy CSV/TSV parser
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
  }

  return Array.from(deduped.values());
}