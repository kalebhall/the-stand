import { documentLayoutSchema } from './schema';
import { adaptLegacyLayoutToDocument, type LegacyPublicLayout } from './legacy-layout-adapter';
import type { DocumentLayout } from './types';

export type BuiltInTemplate = {
  key: string;
  name: string;
  description: string;
  source: 'BUILT_IN';
  documentType: 'SACRAMENT_PROGRAM';
  thumbnail: string;
  layout: DocumentLayout;
};

const definitions: Array<{ key: string; name: string; description: string; preset: LegacyPublicLayout['preset']; title?: string }> = [
  { key: 'classic-bifold', name: 'Classic Bifold', description: 'Traditional folded program with a balanced reading order.', preset: 'SINGLE_SHEET_BIFOLD' },
  { key: 'trifold-bulletin', name: 'Trifold Bulletin', description: 'Compact three-panel bulletin layout.', preset: 'TRI_FOLD_BULLETIN' },
  { key: 'full-page-standard', name: 'Full Page Standard', description: 'Readable single-page program for digital and print use.', preset: 'FULL_PAGE' },
  { key: 'modern-minimal', name: 'Modern Minimal', description: 'Clean text-first layout with restrained visual hierarchy.', preset: 'FULL_PAGE', title: 'Sacrament Meeting' },
  { key: 'compact-one-page', name: 'Compact One Page', description: 'Dense one-page format for shorter programs.', preset: 'FULL_PAGE', title: 'Today’s Program' },
  { key: 'large-print', name: 'Large Print', description: 'Simplified layout intended for comfortable reading.', preset: 'FULL_PAGE', title: 'Sacrament Meeting' },
  { key: 'image-cover', name: 'Image Cover', description: 'Text-first program with an authorized image-cover metadata slot.', preset: 'FULL_PAGE', title: 'Sacrament Meeting' },
  { key: 'announcement-focus', name: 'Announcement Focus', description: 'Program layout that gives approved announcements clear emphasis.', preset: 'FULL_PAGE', title: 'Announcements and Program' }
];

function makeLayout(definition: (typeof definitions)[number]): DocumentLayout {
  const base = adaptLegacyLayoutToDocument({ preset: definition.preset, announcementMode: 'AFTER_PROGRAM', coverMode: definition.key === 'image-cover' ? 'AUTHORIZED_IMAGE' : 'NONE' });
  const layout = structuredClone(base) as DocumentLayout & { metadata: Record<string, unknown> };
  layout.metadata = {
    ...(layout.metadata as Record<string, unknown>),
    builtInKey: definition.key,
    name: definition.name,
    description: definition.description
  };
  const titleBlock = layout.pages[0].regions[0].blocks.find((block) => block.type === 'DOCUMENT_TITLE');
  if (titleBlock) (titleBlock.config as { text: string }).text = definition.title ?? definition.name;
  return documentLayoutSchema.parse(layout);
}

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = definitions.map((definition) => ({
  ...definition,
  source: 'BUILT_IN' as const,
  documentType: 'SACRAMENT_PROGRAM' as const,
  thumbnail: `/program-templates/${definition.key}.svg`,
  layout: makeLayout(definition)
}));

export function getBuiltInTemplate(key: string): BuiltInTemplate | null {
  return BUILT_IN_TEMPLATES.find((template) => template.key === key) ?? null;
}
