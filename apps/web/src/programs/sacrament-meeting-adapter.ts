import { buildPublicPreviewSource } from '@/src/document-designer/meeting-document-service';

import type { ProgramDocument } from './contracts';
import type { ProgramSourceAdapter } from './source-adapter';

export type SacramentMeetingProgramSource = {
  wardId: string;
  meetingId: string;
  meetingDate: string;
  meetingType: string;
  sourceVersion?: string | null;
  wardName?: string | null;
  programItems: Array<{
    itemType: string;
    title?: string | null;
    topic?: string | null;
    hymnTitle?: string | null;
    sequence: number;
    introductionRoles?: { presiding?: string | null; conducting?: string | null } | null;
  }>;
};

export type SacramentMeetingProgramEditorData = SacramentMeetingProgramSource;
export type SacramentMeetingProgramRenderInput = ReturnType<typeof buildPublicPreviewSource>;

export const sacramentMeetingProgramAdapter: ProgramSourceAdapter<
  SacramentMeetingProgramSource,
  SacramentMeetingProgramEditorData,
  SacramentMeetingProgramRenderInput,
  'SACRAMENT_PROGRAM',
  'STAND_MEETING'
> = {
  programType: 'SACRAMENT_PROGRAM',
  sourceType: 'STAND_MEETING',
  resolveSourceRef(source) {
    return { sourceType: 'STAND_MEETING', sourceId: source.meetingId, sourceVersion: this.getSourceVersion(source) };
  },
  getSourceVersion(source) {
    return source.sourceVersion ?? null;
  },
  toEditorData(source) {
    return source;
  },
  toRenderInput(source) {
    return buildPublicPreviewSource(source, source.programItems);
  },
  toDocument(source, payload): ProgramDocument {
    return {
      id: `stand-meeting-program:${source.meetingId}`,
      programType: 'SACRAMENT_PROGRAM',
      source: this.resolveSourceRef(source),
      schemaVersion: 1,
      metadata: {
        title: 'Sacrament Meeting',
        date: source.meetingDate,
        location: null
      },
      payload
    };
  }
};
