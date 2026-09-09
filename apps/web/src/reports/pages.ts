export const REPORT_PAGES = [
  { slug: 'speakers', title: 'Speaker frequency', description: 'Recorded talks, counts, and last talk dates.' },
  { slug: 'topics', title: 'Topic history', description: 'Topics given by speakers and meeting date.' },
  { slug: 'hymns', title: 'Hymn frequency', description: 'Hymn use grouped by program position.' },
  { slug: 'prayers', title: 'Prayer frequency', description: 'Recorded prayer assignments and last dates.' },
  { slug: 'completeness', title: 'Program completeness', description: 'Missing details that need review before publishing.' }
] as const;
