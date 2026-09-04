export type HistoricalProgramItem = {
  itemType: string;
  title: string;
  topic?: string;
  hymnNumber?: string;
  hymnTitle?: string;
};

export type HistoricalMeeting = {
  meetingDate: string;
  meetingType: string;
  programItems: HistoricalProgramItem[];
};

const DATE_RE = /^([A-Z][a-z]{2})-\s*(\d{1,2})\s*\((\d{4})\)$/;
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function clean(value: string): string {
  return value
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value: string): string | null {
  const match = clean(value).match(DATE_RE);
  if (!match) return null;
  const date = new Date(`${match[1]} ${match[2]}, ${match[3]} 12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeName(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/^(brother|bro\.?|sister|sis\.?|elder|president|bishop)\s+/i, '')
    .replace(/[.']/g, '')
    .replace(/\s+/g, ' ');
}

function cellGrid(table: HTMLTableElement): string[][] {
  return Array.from(table.rows, (row) => {
    const values: string[] = [];
    for (const cell of Array.from(row.cells)) {
      const span = Number(cell.colSpan || 1);
      const value = clean(cell.textContent ?? '');
      values.push(value, ...Array(Math.max(0, span - 1)).fill(''));
    }
    return values;
  });
}

function alignedValue(row: string[], labelIndex: number, ordinal: number): string {
  const values = row.slice(labelIndex + 1);
  while (values[0] === '') values.shift();
  if (values[1] === '') values.splice(1, 1);
  return clean(values[ordinal] ?? '');
}
function meetingType(value: string): string {
  const normalized = clean(value).toUpperCase();
  if (normalized.includes('STAKE CONFERENCE')) return 'STAKE_CONFERENCE';
  if (normalized.includes('GENERAL CONFERENCE')) return 'GENERAL_CONFERENCE';
  if (normalized.includes('WARD CONFERENCE')) return 'WARD_CONFERENCE';
  if (normalized.includes('FAST SUNDAY')) return 'FAST_TESTIMONY';
  return 'SACRAMENT';
}

function parseHymn(value: string): Pick<HistoricalProgramItem, 'hymnNumber' | 'hymnTitle' | 'title'> {
  const text = clean(value);
  const match = text.match(/^(\d{1,4})\s+(.+)$/);
  return match ? { hymnNumber: match[1], hymnTitle: clean(match[2]), title: '' } : { title: text };
}

export function parseSacramentPlannerHtml(html: string, cutoffDate = '2026-08-30'): HistoricalMeeting[] {
  if (typeof DOMParser === 'undefined') throw new Error('HTML parsing is only available in a browser');
  const document = new DOMParser().parseFromString(html, 'text/html');
  const table = document.querySelector('table');
  if (!table) throw new Error('No spreadsheet table found');
  const rows = cellGrid(table);
  const dateRow = rows.findIndex((row) => row.some((value) => Boolean(parseDate(value))));
  if (dateRow < 0) throw new Error('No meeting date row found');

  const dates = rows[dateRow].map(parseDate);
  const dateColumns = dates.flatMap((date, index) => (date && date <= cutoffDate ? [{ date, index }] : []));
  if (!dateColumns.length) return [];

  const byLabel = new Map<string, { row: string[]; labelIndex: number }>();
  const knownLabel =
    /^(PRESIDING|CONDUCTING|INVOCATION|BENEDICTION|YOUTH SPEAKER|\d(?:ST|ND|RD|TH) SPEAKER|OPENING HYMN|SACRAMENT HYMN|INTERMEDIATE HYMN|CLOSING HYMN|THEME \d)$/i;
  for (const row of rows.slice(dateRow + 1)) {
    const labelIndex = row.slice(0, dateColumns[0].index).findIndex((value) => knownLabel.test(clean(value)));
    const label = labelIndex >= 0 ? clean(row[labelIndex]) : '';
    if (label) byLabel.set(label.toUpperCase(), { row, labelIndex });
  }

  const itemRows = [
    ['PRESIDING', 'PRESIDING'],
    ['CONDUCTING', 'CONDUCTING'],
    ['OPENING HYMN', 'OPENING_HYMN'],
    ['INVOCATION', 'INVOCATION'],
    ['SACRAMENT HYMN', 'SACRAMENT_HYMN'],
    ['YOUTH SPEAKER', 'SPEAKER'],
    ['2ND SPEAKER', 'SPEAKER'],
    ['3RD SPEAKER', 'SPEAKER'],
    ['4TH SPEAKER', 'SPEAKER'],
    ['INTERMEDIATE HYMN', 'SPECIAL_HYMN'],
    ['CLOSING HYMN', 'CLOSING_HYMN'],
    ['BENEDICTION', 'BENEDICTION']
  ] as const;
  const topicRows = ['THEME 1', 'THEME 2', 'THEME 3', 'THEME 4'];
  const typeRow = rows.find((row) =>
    row.some((value) => /^(REGULAR|FAST SUNDAY|STAKE CONFERENCE|WARD CONFERENCE|GENERAL CONFERENCE)$/i.test(value))
  );

  return dateColumns
    .map(({ date }, ordinal) => {
      let speakerNumber = 0;
      const programItems: HistoricalProgramItem[] = [];
      for (const [label, itemType] of itemRows) {
        const row = byLabel.get(label);
        const value = row ? alignedValue(row.row, row.labelIndex, ordinal) : '';
        if (!value || value.toUpperCase() === 'N/A') continue;
        const isHymn = itemType.endsWith('HYMN');
        const parsed = isHymn ? parseHymn(value) : { title: value };
        const item: HistoricalProgramItem = { itemType, title: parsed.title };
        if (parsed.hymnNumber) item.hymnNumber = parsed.hymnNumber;
        if (parsed.hymnTitle) item.hymnTitle = parsed.hymnTitle;
        if (itemType === 'SPEAKER') {
          const topicRow = byLabel.get(topicRows[speakerNumber]);
          const topic = topicRow ? alignedValue(topicRow.row, topicRow.labelIndex, ordinal) : '';
          if (topic) item.topic = topic;
          speakerNumber += 1;
        }
        programItems.push(item);
      }
      const typeValue =
        typeRow?.slice().filter((value) => /^(REGULAR|FAST SUNDAY|STAKE CONFERENCE|WARD CONFERENCE|GENERAL CONFERENCE)$/i.test(value))[
          ordinal
        ] ?? '';
      return { meetingDate: date, meetingType: meetingType(typeValue), programItems };
    })
    .filter((meeting) => meeting.programItems.length > 0);
}

export function normalizeHistoricalName(value: string): string {
  return normalizeName(value);
}

export function formatHistoricalDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return DATE_FORMAT.format(new Date(Date.UTC(year, month - 1, day, 12)));
}
