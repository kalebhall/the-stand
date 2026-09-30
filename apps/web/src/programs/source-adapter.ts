import type { ProgramDocument, ProgramSourceRef, ProgramType } from './contracts';

export type ProgramSourceAdapter<TSource, TEditorData, TRenderInput> = {
  programType: ProgramType;
  sourceType: ProgramSourceRef['sourceType'];
  resolveSourceRef(source: TSource): ProgramSourceRef;
  getSourceVersion(source: TSource): string | null;
  toEditorData(source: TSource): TEditorData;
  toRenderInput(source: TSource): TRenderInput;
  toDocument(source: TSource, payload: unknown): ProgramDocument;
};
