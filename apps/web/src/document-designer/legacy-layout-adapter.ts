import { documentLayoutSchema } from './schema';
import { idSchema } from './primitives';
import { normalizeToAdvanced, type AdvancedDocumentLayout } from './advanced-schema';
import type { DocumentBlock, DocumentLayout } from './types';
import type { PublicAnnouncementMode, PublicCoverMode, PublicLayoutPreset } from '@/src/meetings/public-layout';

export type LegacyPublicLayout = {
  preset: PublicLayoutPreset;
  announcementMode: PublicAnnouncementMode;
  coverMode: PublicCoverMode;
  coverImageUrl?: string | null;
  coverImageAltText?: string | null;
};

export const COMPATIBILITY_PUBLIC_BLOCK_TYPES = [
  'DOCUMENT_TITLE',
  'WARD_NAME',
  'MEETING_INFO',
  'PRESIDING_CONDUCTING',
  'MUSIC_LEADERS',
  'MEETING_PROGRAM',
  'ANNOUNCEMENTS',
  'QR_CODE',
  'CUSTOM_LINK',
  'IMAGE'
] as const;

export const LEGACY_COVER_ASSET_ID = '00000000-0000-4000-8000-000000000020';

const uuid = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;

function block(
  type: DocumentBlock['type'],
  index: number,
  config: Record<string, unknown>,
  dataMode: 'AUTO' | 'MANUAL' = 'AUTO'
): DocumentBlock {
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
    block('PRESIDING_CONDUCTING', 4, { text: '' }),
    block('MUSIC_LEADERS', 5, { text: '' }),
    block('MEETING_PROGRAM', 6, { items: [] }),
    block('ANNOUNCEMENTS', 7, { text: '' }),
    block('QR_CODE', 8, { href: null, label: '' }, 'MANUAL'),
    ...(legacy.coverMode === 'AUTHORIZED_IMAGE' && legacy.coverImageUrl
      ? [block('IMAGE', 9, { assetId: LEGACY_COVER_ASSET_ID, alt: legacy.coverImageAltText ?? '', isDecorative: false })]
      : [])
  ];
  const layout = {
    id: idSchema.parse(uuid(1)),
    schemaVersion: 1,
    documentType: 'SACRAMENT_PROGRAM' as const,
    paper: 'LETTER' as const,
    orientation: legacy.preset === 'FULL_PAGE' ? ('PORTRAIT' as const) : ('LANDSCAPE' as const),
    fold:
      legacy.preset === 'SINGLE_SHEET_BIFOLD'
        ? ('BIFOLD' as const)
        : legacy.preset === 'TRI_FOLD_BULLETIN'
          ? ('TRIFOLD' as const)
          : ('NONE' as const),
    theme: { fontFamily: 'SYSTEM_SANS' as const, baseFontSize: 12, accentColor: '#1f2937' },
    metadata: {
      documentTitleSource: 'LEGACY_DEFAULT',
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

export function adaptLegacyLayoutToAdvancedDocument(legacy: LegacyPublicLayout): AdvancedDocumentLayout {
  const normalized = normalizeToAdvanced(adaptLegacyLayoutToDocument(legacy));
  if (legacy.announcementMode === 'NONE') {
    return {
      ...normalized,
      pages: normalized.pages.map((page) => ({
        ...page,
        regions: page.regions.map((region) => ({
          ...region,
          blocks: region.blocks.map((candidate) =>
            candidate.type === 'ANNOUNCEMENTS' ? { ...candidate, visibility: 'HIDDEN' as const } : candidate
          )
        }))
      }))
    };
  }
  if (legacy.announcementMode !== 'BACK_PANEL') return normalized;

  const rebuildColumns = (region: (typeof normalized.pages)[number]['regions'][number]) => ({
    ...region,
    columns: {
      ...region.columns,
      blockIds: Array.from({ length: region.columns.count }, (_, columnIndex) =>
        region.blocks.filter((_, blockIndex) => blockIndex % region.columns.count === columnIndex).map((candidate) => candidate.id)
      )
    }
  });
  return {
    ...normalized,
    pages: normalized.pages.map((page) => {
      const sourceRegionIndex = page.regions.findIndex((region) => region.blocks.some((candidate) => candidate.type === 'ANNOUNCEMENTS'));
      if (sourceRegionIndex < 0 || sourceRegionIndex === page.regions.length - 1) return page;
      const sourceRegion = page.regions[sourceRegionIndex];
      const announcement = sourceRegion.blocks.find((candidate) => candidate.type === 'ANNOUNCEMENTS');
      if (!announcement) return page;
      const nextRegions = page.regions.map((region, regionIndex) => {
        if (regionIndex === sourceRegionIndex)
          return rebuildColumns({ ...region, blocks: region.blocks.filter((candidate) => candidate.id !== announcement.id) });
        if (regionIndex === page.regions.length - 1) return rebuildColumns({ ...region, blocks: [...region.blocks, announcement] });
        return region;
      });
      return { ...page, regions: nextRegions };
    })
  };
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
