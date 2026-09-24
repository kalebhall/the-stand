export type ModuleNavigationItem = {
  href: string;
  label: string;
};

export type ModuleDefinition = {
  id: string;
  name: string;
  version: string;
  defaultEnabled: boolean;
  navigation: readonly ModuleNavigationItem[];
  routes: readonly string[];
  permissions: readonly string[];
  eventHandlers?: readonly ModuleEventHandler[];
};

import type { CoreEvent } from '@/src/platform/events/core';

export type ModuleEventHandler = (event: CoreEvent) => void | Promise<void>;

export type ModuleRegistry = {
  readonly modules: readonly ModuleDefinition[];
  get(moduleId: string): ModuleDefinition | undefined;
};

export type ModuleEnablement = {
  isEnabled(wardId: string, moduleId: string): boolean;
  setEnabled(wardId: string, moduleId: string, enabled: boolean): void;
};
