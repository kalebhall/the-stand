export const ADVANCED_DESIGNER_FLAG = 'advanced-designer' as const;

export type AdvancedDesignerGate = {
  repositoryEnabled: boolean;
  wardEnabled?: boolean;
  capabilityEnabled?: boolean;
};

export function isAdvancedDesignerEnabled({ repositoryEnabled, wardEnabled = true, capabilityEnabled = true }: AdvancedDesignerGate): boolean {
  return repositoryEnabled && wardEnabled && capabilityEnabled;
}

/** Defaults on to preserve current behavior until the repository flag is set to false. */
export function isAdvancedDesignerFeatureEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED ?? process.env.ADVANCED_DESIGNER_ENABLED;
  return value !== '0' && value !== 'false';
}