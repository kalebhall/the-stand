import { renderDocumentHtml } from './renderer';
import { resolveDocumentData, type SafeMeetingSource } from './data-resolver';
import type { DocumentRenderOutput, RenderTarget } from './render-types';

export function renderProgramPreview(layoutInput: unknown, source: SafeMeetingSource, options: { target?: RenderTarget; publicVisitor?: boolean } = {}): DocumentRenderOutput {
  const publicVisitor = options.publicVisitor ?? false;
  const explicitPublicBlockTypes = ['MEETING_PROGRAM', 'ANNOUNCEMENTS', 'QR_CODE'];
  const { layout, data } = resolveDocumentData(layoutInput, source, { public: publicVisitor, explicitPublicBlockTypes });
  return renderDocumentHtml({ layout, data, target: options.target ?? 'DIGITAL', public: publicVisitor, explicitPublicBlockTypes });
}
