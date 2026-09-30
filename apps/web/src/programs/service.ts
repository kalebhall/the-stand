import type { ProgramDocument } from './contracts';
import { getProgramRegistration, hasProgramType, type ProgramRegistration } from './registry';
import type { SacramentMeetingProgramSource } from './sacrament-meeting-adapter';

export class UnknownProgramTypeError extends Error {
  constructor(programType: string) {
    super(`Unsupported program type: ${programType}`);
    this.name = 'UnknownProgramTypeError';
  }
}

export function requireProgramRegistration(programType: string): ProgramRegistration {
  if (!hasProgramType(programType)) throw new UnknownProgramTypeError(programType);
  const registration = getProgramRegistration(programType);
  if (!registration) throw new UnknownProgramTypeError(programType);
  return registration;
}

/**
 * First concrete service operation. It deliberately accepts only the source
 * shape registered for SACRAMENT_PROGRAM; future source types add a typed
 * service operation instead of weakening this boundary to `unknown`.
 */
export function buildProgramDocument(
  programType: string,
  source: SacramentMeetingProgramSource,
  payload: unknown
): ProgramDocument {
  const registration = requireProgramRegistration(programType);
  if (registration.programType !== 'SACRAMENT_PROGRAM' || registration.sourceType !== 'STAND_MEETING') {
    throw new UnknownProgramTypeError(programType);
  }
  return registration.adapter.toDocument(source, payload);
}
