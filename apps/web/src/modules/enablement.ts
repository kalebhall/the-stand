import { DEFAULT_MODULE_REGISTRY } from './registry';
import type { ModuleEnablement, ModuleRegistry } from './types';

export function createModuleEnablement(
  overrides: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {},
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
): ModuleEnablement {
  const values = new Map<string, Map<string, boolean>>();

  for (const [wardId, wardModules] of Object.entries(overrides)) {
    values.set(wardId, new Map(Object.entries(wardModules)));
  }

  return {
    isEnabled(wardId: string, moduleId: string): boolean {
      return values.get(wardId)?.get(moduleId) ?? registry.get(moduleId)?.defaultEnabled ?? false;
    },
    setEnabled(wardId: string, moduleId: string, enabled: boolean): void {
      const wardValues = values.get(wardId) ?? new Map<string, boolean>();
      wardValues.set(moduleId, enabled);
      values.set(wardId, wardValues);
    }
  };
}

export function getEnabledModules(
  wardId: string,
  enablement: ModuleEnablement,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
) {
  return registry.modules.filter((module) => enablement.isEnabled(wardId, module.id));
}

export function composeModuleNavigation(
  wardId: string,
  enablement: ModuleEnablement,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
) {
  const seen = new Set<string>();
  return getEnabledModules(wardId, enablement, registry).flatMap((module) =>
    module.navigation.filter((item) => {
      if (!isModuleRouteEnabled(wardId, item.href, enablement, registry)) return false;
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    })
  );
}

export function composeModulePermissions(
  wardId: string,
  enablement: ModuleEnablement,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
): string[] {
  return [...new Set(getEnabledModules(wardId, enablement, registry).flatMap((module) => module.permissions))];
}

export function isModuleRouteEnabled(
  wardId: string,
  route: string,
  enablement: ModuleEnablement,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
): boolean {
  return getEnabledModules(wardId, enablement, registry).some((module) =>
    module.routes.some((moduleRoute) => route === moduleRoute || route.startsWith(`${moduleRoute}/`))
  );
}
