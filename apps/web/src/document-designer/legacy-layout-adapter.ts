import { documentLayoutSchema } from './schema';
import { idSchema } from './primitives';
import type { DocumentBlock, DocumentLayout } from './types';
import type { PublicAnnouncementMode, PublicCoverMode, PublicLayoutPreset } from '@/src/meetings/public-layout';

export type LegacyPublicLayout = {
  preset: PublicLayoutPreset;
  announcementMode: PublicAnnouncementMode;
  coverMode: PublicCoverMode;
  coverImageUrl?: string | null;
  coverImageAltText?: string | null;
};

export const COMPATIBILITY_PUBLIC_BLOCK_TYPES = ['DOCUMENT_TITLE', 'WARD_NAME', 'MEETING_INFO', 'MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'] as const;

const uuid = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;

function block(type: DocumentBlock['type'], index: number, config: Record<string, unknown>, dataMode: 'AUTO' | 'MANUAL' = 'AUTO'): DocumentBlock {
  return {
    id: idSchema.parse(uuid(index + 10)),
    type,
    width: 'FULL',
    dataMode,
    visibility: 'VISIBLE',
    printBehavior: 'PRINT_AND_DIGITAL',
    digitalBehavior: 'NORMAL',
    config
  } as DocumentBlock;
}

export function adaptLegacyLayoutToDocument(legacy: LegacyPublicLayout): DocumentLayout {
  const blocks: DocumentBlock[] = [
    block('DOCUMENT_TITLE', 1, { text: 'Sacrament Meeting' }, 'MANUAL'),
    block('WARD_NAME', 2, { text: 'Ward' }),
    block('MEETING_INFO', 3, { includeDate: true, includeTime: true, includeLocation: true }),
    block('MEETING_PROGRAM', 4, { items: [] }),
    block('ANNOUNCEMENTS', 5, { text: '' }),
    block('QR_CODE', 6, { href: 'https://example.com', label: 'Open digital program' }, 'MANUAL')
  ];
  const layout = {
    id: idSchema.parse(uuid(1)),
    schemaVersion: 1,
    documentType: 'SACRAMENT_PROGRAM' as const,
    paper: 'LETTER' as const,
    orientation: legacy.preset === 'FULL_PAGE' ? 'PORTRAIT' as const : 'LANDSCAPE' as const,
    fold: legacy.preset === 'SINGLE_SHEET_BIFOLD' ? 'BIFOLD' as const : legacy.preset === 'TRI_FOLD_BULLETIN' ? 'TRIFOLD' as const : 'NONE' as const,
    theme: { fontFamily: 'SYSTEM_SANS' as const, baseFontSize: 12, accentColor: '#1f2937' },
    metadata: {
      legacyPreset: legacy.preset,
      announcementMode: legacy.announcementMode,
      coverMode: legacy.coverMode,
      coverImageUrl: legacy.coverImageUrl ?? null,
      coverImageAltText: legacy.coverImageAltText ?? null
    },
    pages: [{ id: idSchema.parse(uuid(2)), regions: [{ id: idSchema.parse(uuid(3)), ratio: 1, gutter: 0, blocks }] }]
  } satisfies DocumentLayout;
  return documentLayoutSchema.parse(layout);
}

type AdapterMetadata = LegacyPublicLayout & { legacyPreset: PublicLayoutPreset };

export function adaptDocumentToLegacyLayout(layout: DocumentLayout): LegacyPublicLayout | null {
  const metadata = layout.metadata as Partial<AdapterMetadata> | undefined;
  if (!metadata?.legacyPreset || !['SINGLE_SHEET_BIFOLD', 'TRI_FOLD_BULLETIN', 'FULL_PAGE'].includes(metadata.legacyPreset)) return null;
  return {
    preset: metadata.legacyPreset,
    announcementMode: metadata.announcementMode ?? 'AFTER_PROGRAM',
    coverMode: metadata.coverMode ?? 'NONE',
    coverImageUrl: metadata.coverImageUrl ?? null,
    coverImageAltText: metadata.coverImageAltText ?? null
  };
}
