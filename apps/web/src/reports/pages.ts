export const REPORT_PAGES = [
  { slug: 'speakers', titleKey: 'speakerFrequency', descriptionKey: 'speakerReportDescription' },
  { slug: 'topics', titleKey: 'topicHistory', descriptionKey: 'topicReportDescription' },
  { slug: 'hymns', titleKey: 'hymnFrequency', descriptionKey: 'hymnReportDescription' },
  { slug: 'prayers', titleKey: 'prayerFrequency', descriptionKey: 'prayerReportDescription' },
  { slug: 'completeness', titleKey: 'programCompleteness', descriptionKey: 'completenessReportDescription' }
] as const;
