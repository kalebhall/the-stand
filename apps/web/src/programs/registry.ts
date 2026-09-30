import type { ProgramType, ProgramSourceType } from './contracts';
import { baptismProgramAdapter } from './baptism-adapter';
import { sacramentMeetingProgramAdapter } from './sacrament-meeting-adapter';
import type { ProgramSourceAdapter } from './source-adapter';

export type ProgramRegistration = {
  readonly programType: ProgramType;
  readonly sourceType: ProgramSourceType;
  readonly adapter: ProgramSourceAdapter<any, any, any>;
};

function assertUniqueRegistryKeys(registrations: readonly ProgramRegistration[]): void {
  if (new Set(registrations.map((registration) => registration.programType)).size !== registrations.length) {
    throw new Error('Program registry contains duplicate program types.');
  }
  const keys = registrations.map((registration) => `${registration.programType}:${registration.sourceType}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error('Program registry contains duplicate program/source registrations.');
  }
}

export const PROGRAM_REGISTRY = [
  {
    programType: sacramentMeetingProgramAdapter.programType,
    sourceType: sacramentMeetingProgramAdapter.sourceType,
    adapter: sacramentMeetingProgramAdapter
  },
  {
    programType: baptismProgramAdapter.programType,
    sourceType: baptismProgramAdapter.sourceType,
    adapter: baptismProgramAdapter
  }
] as const satisfies readonly ProgramRegistration[];

assertUniqueRegistryKeys(PROGRAM_REGISTRY);

export function getProgramRegistration(programType: ProgramType): ProgramRegistration | undefined {
  return PROGRAM_REGISTRY.find((registration) => registration.programType === programType);
}

export function hasProgramType(programType: string): programType is ProgramType {
  return PROGRAM_REGISTRY.some((registration) => registration.programType === programType);
}

export function validateProgramRegistry(registrations: readonly ProgramRegistration[]): void {
  assertUniqueRegistryKeys(registrations);
}
