export type ParsedCalling = {
  memberName: string;
  callingName: string;
  isRelease: boolean;
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

function parseCallingLine(line: string): ParsedCalling | null {
  const normalized = line.trim();
  if (!normalized) {
    return null;
  }

  const release = /^release\s*[:\-]?\s*/i;
  const sustain = /^sustain(?:ed|ing)?\s*[:\-]?\s*/i;

  const isRelease = release.test(normalized);
  const withoutPrefix = normalized.replace(release, '').replace(sustain, '').trim();
  if (!withoutPrefix) {
    return null;
  }

  const separators = ['\t', '|', ' - ', ' — ', ' – ', ','];

  for (const separator of separators) {
    const parts = withoutPrefix
      .split(separator)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length >= 2) {
      return {
        memberName: parts[0],
        callingName: parts.slice(1).join(' '),
        isRelease
      };
    }
  }

  const byAs = withoutPrefix.match(/^(.*?)\s+as\s+(.+)$/i);
  if (byAs) {
    return {
      memberName: byAs[1].trim(),
      callingName: byAs[2].trim(),
      isRelease
    };
  }

  return null;
}

export function parseCallingsText(rawText: string): ParsedCalling[] {
  const plainText = toPlainText(rawText);
  if (!plainText) {
    return [];
  }

  const deduped = new Map<string, ParsedCalling>();

  for (const line of plainText.split('\n')) {
    const parsed = parseCallingLine(line);
    if (!parsed) {
      continue;
    }

    const key = `${parsed.memberName.toLowerCase()}::${parsed.callingName.toLowerCase()}`;
    deduped.set(key, parsed);
  }

  return Array.from(deduped.values());
}
