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
  return normalized.length ? normalized : null;
}

function sanitizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized.includes('@') ? normalized : null;
}

type FieldMapping = 'name' | 'email' | 'phone' | 'age' | 'birthday' | 'gender' | 'unknown';

type Delimiter = 'tab' | 'pipe' | 'comma';

function detectDelimiter(line: string): Delimiter {
  if (line.includes('\t')) return 'tab';
  if (/\s\|\s|\|/.test(line)) return 'pipe';
  return 'comma';
}

function splitLine(line: string, delimiter: Delimiter): string[] {
  switch (delimiter) {
    case 'tab':
      return line.split('\t');
    case 'pipe':
      return line.split(/\s*\|\s*/);
    case 'comma':
      return line.split(/\s*,\s*/);
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

function parseBirthday(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function parseGender(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
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
        birthday = parseBirthday(value);
        break;
      case 'gender':
        gender = parseGender(value);
        break;
      case 'unknown':
        // Try to infer unknown columns by content
        if (!email && value.includes('@')) {
          email = sanitizeEmail(value);
        } else if (!phone && !fullName) {
          fullName = value;
        }
        break;
    }
  }

  if (!fullName) return null;

  return { fullName, email, phone, age, birthday, gender };
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

  // Check if the first line is a header row
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
