import { parseDocumentLayout } from './schema';
import { isAdvancedLayout, parseAdvancedLayout, projectAdvancedLayoutForOutput, downgradeToV1 } from './advanced-schema';
import { allBlocks, validatePublicDocumentLayout } from './public-safety';
import type { DocumentBlock, DocumentLayout } from './types';
import type { ResolvedDocumentData } from './render-types';

export type SafeMeetingSource = {
  meetingDate: string;
  meetingType: string;
  meetingTime?: string | null;
  wardName?: string | null;
  location?: string | null;
  publicUrl?: string | null;
  programItems: Array<{ order: number; label: string; details?: string | null }>;
  publicValues?: Partial<Record<DocumentBlock['type'], string | null>>;
  media?: Partial<Record<string, { url: string; altText: string | null; isDecorative: boolean }>>;
};

export function resolveDocumentData(
  inputLayout: unknown,
  source: SafeMeetingSource,
  options: { public?: boolean; target?: 'PRINT' | 'DIGITAL'; explicitPublicBlockTypes?: readonly string[] } = {}
): { layout: DocumentLayout; data: ResolvedDocumentData } {
  const advancedLayout = isAdvancedLayout(inputLayout) ? parseAdvancedLayout(inputLayout) : null;
  let layout = advancedLayout
    ? downgradeToV1(advancedLayout)
    : parseDocumentLayout(inputLayout);
  const configuredValues = Object.fromEntries(
    allBlocks(layout).flatMap((block) => {
      const config = block.config as { text?: string };
      return typeof config.text === 'string' ? [[block.type, config.text]] : [];
    })
  ) as Partial<Record<DocumentBlock['type'], string | null>>;
  const meetingInfoBlock = allBlocks(layout).find((block) => block.type === 'MEETING_INFO');
  const meetingInfoConfig = meetingInfoBlock?.config as { includeDate?: boolean; includeTime?: boolean; includeLocation?: boolean } | undefined;
  const meetingInfoParts = [
    meetingInfoConfig?.includeDate !== false ? source.meetingDate : null,
    meetingInfoConfig?.includeTime !== false ? source.meetingTime ?? source.meetingType.replaceAll('_', ' ') : null,
    meetingInfoConfig?.includeLocation !== false ? source.location : null
  ].filter((part): part is string => Boolean(part));

  const values: Partial<Record<DocumentBlock['type'], string | null>> = {
    ...configuredValues,
    ...source.publicValues,
    DOCUMENT_TITLE: configuredValues.DOCUMENT_TITLE ?? 'Sacrament Meeting',
    WARD_NAME: source.wardName ?? configuredValues.WARD_NAME ?? null,
    MEETING_INFO: meetingInfoParts.join(' · '),
    MEETING_PROGRAM: source.programItems.map((item) => item.label).join(' · '),
    CUSTOM_LINK: configuredValues.CUSTOM_LINK ?? null,
    QR_CODE: source.publicUrl ?? null
  };

  const data: ResolvedDocumentData = {
    meetingDate: source.meetingDate,
    meetingType: source.meetingType,
    wardName: source.wardName,
    location: source.location,
    publicUrl: source.publicUrl,
    values,
    meetingItems: source.programItems,
    warnings: [],
    media: source.media ?? {}
  };
  if (advancedLayout) {
    layout = projectAdvancedLayoutForOutput(advancedLayout, options.public ? 'PUBLIC' : (options.target ?? 'DIGITAL'), data);
    if (options.public) validatePublicDocumentLayout(layout, options.explicitPublicBlockTypes ?? []);
  } else if (options.public) {
    validatePublicDocumentLayout(layout, options.explicitPublicBlockTypes ?? []);
  }
  return { layout, data };
}
