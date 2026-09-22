import { renderDocumentHtml } from './renderer';
import { resolveDocumentData, type SafeMeetingSource } from './data-resolver';
import { isAdvancedLayout, parseAdvancedLayout, projectAdvancedLayoutForOutput } from './advanced-schema';
import type { DocumentRenderOutput, RenderTarget } from './render-types';

export function renderProgramPreview(layoutInput: unknown, source: SafeMeetingSource, options: { target?: RenderTarget; publicVisitor?: boolean } = {}): DocumentRenderOutput {
  const publicVisitor = options.publicVisitor ?? false;
  const explicitPublicBlockTypes = ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'];
  const { layout, data } = resolveDocumentData(layoutInput, source, { public: publicVisitor, target: options.target ?? 'DIGITAL', explicitPublicBlockTypes });
  const outputLayout = isAdvancedLayout(layoutInput)
    ? projectAdvancedLayoutForOutput(parseAdvancedLayout(layoutInput), publicVisitor ? 'PUBLIC' : (options.target ?? 'DIGITAL'), data)
    : layout;
  return renderDocumentHtml({ layout: outputLayout, data, target: options.target ?? 'DIGITAL', public: publicVisitor, explicitPublicBlockTypes });
}
