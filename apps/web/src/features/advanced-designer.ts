export const ADVANCED_DESIGNER_FLAG = 'advanced-designer' as const;

/** Defaults on to preserve current behavior until the repository flag is set to false. */
export function isAdvancedDesignerFeatureEnabled(): boolean {
  const values = [process.env.NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED, process.env.ADVANCED_DESIGNER_ENABLED];
  return values.every((value) => value !== '0' && value !== 'false');
}
