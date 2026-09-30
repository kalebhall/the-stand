import type { ProgramDocument, ProgramSourceRef, ProgramType } from './contracts';

export type ProgramSourceAdapter<
  TSource,
  TEditorData,
  TRenderInput,
  TProgramType extends ProgramType = ProgramType,
  TSourceType extends ProgramSourceRef['sourceType'] = ProgramSourceRef['sourceType']
> = {
  programType: TProgramType;
  sourceType: TSourceType;
  resolveSourceRef(source: TSource): ProgramSourceRef;
  getSourceVersion(source: TSource): string | null;
  toEditorData(source: TSource): TEditorData;
  toRenderInput(source: TSource): TRenderInput;
  toDocument(source: TSource, payload: unknown): ProgramDocument;
};
