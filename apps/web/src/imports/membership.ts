export type ParsedMember = {
  fullName: string;
  email: string | null;
  phone: string | null;
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

export function parseMembershipText(rawText: string): ParsedMember[] {
  const plainText = toPlainText(rawText);
  if (!plainText) {
    return [];
  }

  const deduped = new Map<string, ParsedMember>();

  for (const line of plainText.split('\n')) {
    const parts = line
      .split(/\t|\s*\|\s*|\s*,\s*/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (!parts.length) {
      continue;
    }

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

    const existing = deduped.get(fullName.toLowerCase());
    if (existing) {
      deduped.set(fullName.toLowerCase(), {
        fullName,
        email: email ?? existing.email,
        phone: phone ?? existing.phone
      });
      continue;
    }

    deduped.set(fullName.toLowerCase(), { fullName, email, phone });
  }

  return Array.from(deduped.values());
}
