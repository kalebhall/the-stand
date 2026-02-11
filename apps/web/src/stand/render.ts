export type StandProgramItem = {
  itemType: string;
  title: string | null;
  notes: string | null;
  hymnNumber: string | null;
  hymnTitle: string | null;
};

export type StandTemplate = {
  welcomeText: string;
  sustainTemplate: string;
  releaseTemplate: string;
};

export type StandRow =
  | {
      kind: 'welcome';
      text: string;
    }
  | {
      kind: 'standard';
      label: string;
      details: string;
    }
  | {
      kind: 'sustain' | 'release';
      segments: Array<{ text: string; bold: boolean }>;
      summary: string;
    };

const DEFAULT_TEMPLATE: StandTemplate = {
  welcomeText: 'Welcome to The Church of Jesus Christ of Latter-day Saints.',
  sustainTemplate: 'Those in favor of sustaining **{memberName}** as **{callingName}**, please manifest it.',
  releaseTemplate: 'Those who wish to express appreciation for the service of **{memberName}** as **{callingName}**, please do so.'
};

function toDisplayLabel(itemType: string): string {
  return itemType
    .split('_')
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function parseBoldSegments(text: string): Array<{ text: string; bold: boolean }> {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('**') && segment.endsWith('**')) {
        return { text: segment.slice(2, -2), bold: true };
      }

      return { text: segment, bold: false };
    });
}

function getMemberAndCalling(item: StandProgramItem): { memberName: string; callingName: string } {
  const memberName = item.title?.trim() || 'the member';
  const callingName = item.notes?.trim() || toDisplayLabel(item.itemType);
  return { memberName, callingName };
}

function renderTemplateLine(template: string, values: { memberName: string; callingName: string }) {
  const message = template.replaceAll('{memberName}', values.memberName).replaceAll('{callingName}', values.callingName);
  return {
    segments: parseBoldSegments(message),
    summary: `${values.memberName} — ${values.callingName}`
  };
}

export function buildStandRows(items: StandProgramItem[], templateOverrides?: Partial<StandTemplate>): StandRow[] {
  const template: StandTemplate = {
    welcomeText: templateOverrides?.welcomeText ?? DEFAULT_TEMPLATE.welcomeText,
    sustainTemplate: templateOverrides?.sustainTemplate ?? DEFAULT_TEMPLATE.sustainTemplate,
    releaseTemplate: templateOverrides?.releaseTemplate ?? DEFAULT_TEMPLATE.releaseTemplate
  };

  const rows: StandRow[] = [{ kind: 'welcome', text: template.welcomeText }];

  for (const item of items) {
    const normalizedType = item.itemType.toUpperCase();
    const label = toDisplayLabel(normalizedType);

    if (normalizedType.includes('SUSTAIN')) {
      const values = getMemberAndCalling(item);
      rows.push({
        kind: 'sustain',
        ...renderTemplateLine(template.sustainTemplate, values)
      });
      continue;
    }

    if (normalizedType.includes('RELEASE')) {
      const values = getMemberAndCalling(item);
      rows.push({
        kind: 'release',
        ...renderTemplateLine(template.releaseTemplate, values)
      });
      continue;
    }

    const hymnBits = [item.hymnNumber?.trim(), item.hymnTitle?.trim()].filter(Boolean).join(' — ');
    const details = item.title?.trim() || item.notes?.trim() || hymnBits || label;

    rows.push({ kind: 'standard', label, details });
  }

  return rows;
}
