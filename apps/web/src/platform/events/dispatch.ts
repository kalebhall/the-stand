import type { ModuleRegistry } from '@/src/modules/types';
import { DEFAULT_MODULE_REGISTRY } from '@/src/modules/registry';
import { getWardModuleSettings } from '@/src/modules/service';
import type { CoreEvent } from './core';

/** Dispatches named Core events to enabled module subscriptions. */
export async function dispatchCoreEvent(
  event: CoreEvent,
  wardId: string,
  registry: ModuleRegistry,
  isEnabled: (wardId: string, moduleId: string) => boolean
): Promise<void> {
  for (const module of registry.modules) {
    if (!isEnabled(wardId, module.id)) continue;
    for (const handler of module.eventHandlers ?? []) await handler(event);
  }
}

export async function dispatchPersistedCoreEvent(event: CoreEvent, userId: string): Promise<void> {
  const settings = await getWardModuleSettings(event.wardId, userId);
  const enabled = new Map(settings.map((module) => [module.id, module.enabled]));
  await dispatchCoreEvent(event, event.wardId, DEFAULT_MODULE_REGISTRY, (wardId, moduleId) => wardId === event.wardId && (enabled.get(moduleId) ?? false));
}