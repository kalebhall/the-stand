import { renderDocumentHtml } from './renderer';
import { resolveDocumentData, type SafeMeetingSource } from './data-resolver';
import { isAdvancedLayout, parseAdvancedLayout, projectAdvancedLayoutForOutput } from './advanced-schema';
import type { DocumentRenderOutput, RenderTarget } from './render-types';

export function renderProgramPreview(
  layoutInput: unknown,
  source: SafeMeetingSource,
  options: { target?: RenderTarget; publicVisitor?: boolean; advancedProjection?: boolean; mobile?: boolean } = {}
): DocumentRenderOutput {
  const publicVisitor = options.publicVisitor ?? false;
  const explicitPublicBlockTypes = [
    'MEETING_PROGRAM',
    'ANNOUNCEMENT_LIST',
    'SECTION_HEADING',
    'SIMPLE_LIST',
    'ANNOUNCEMENTS',
    'PRESIDING_CONDUCTING',
    'MUSIC_LEADERS',
    'QR_CODE',
    'CUSTOM_LINK'
  ];
  const { layout, data } = resolveDocumentData(layoutInput, source, {
    public: publicVisitor,
    target: options.target ?? 'DIGITAL',
    explicitPublicBlockTypes,
    advancedProjection: options.advancedProjection
  });
  const outputLayout =
    options.advancedProjection === false
      ? layout
      : isAdvancedLayout(layoutInput)
        ? projectAdvancedLayoutForOutput(parseAdvancedLayout(layoutInput), publicVisitor ? 'PUBLIC' : (options.target ?? 'DIGITAL'), data)
        : layout;
  return renderDocumentHtml({
    layout: outputLayout,
    data,
    target: options.target ?? 'DIGITAL',
    mobile: options.mobile,
    public: publicVisitor,
    explicitPublicBlockTypes
  });
}
