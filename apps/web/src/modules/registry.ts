import type { ModuleDefinition, ModuleRegistry } from './types';
import { technologyChecklistModule } from './technology-checklist';

export const CORE_MODULE_ID = 'conducting-core';

const MODULES: readonly ModuleDefinition[] = [
  {
    id: CORE_MODULE_ID,
    name: 'Conducting Core',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/meetings', label: 'Meetings' }
    ],
    routes: ['/dashboard', '/meetings', '/stand'],
    permissions: ['meetings.view', 'meetings.manage', 'conducting.view']
  },
  {
    id: 'programs',
    name: 'Programs',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [
      { href: '/programs', label: 'Programs' },
      { href: '/programs/templates', label: 'Templates' },
      { href: '/programs/templates/admin', label: 'Template Administration' }
    ],
    routes: ['/programs'],
    permissions: ['programs.view', 'programs.manage', 'programs.templates.manage']
  },
  {
    id: 'bishopric',
    name: 'Bishopric Agenda',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/bishopric', label: 'Bishopric Agenda' }],
    routes: ['/bishopric'],
    permissions: ['bishopric.view', 'bishopric.manage']
  },
  {
    ...technologyChecklistModule
  },
  {
    id: 'leadership',
    version: '1.0.0',
    name: 'Leadership Workflows',
    defaultEnabled: true,
    navigation: [
      { href: '/interviews', label: 'Scheduled Interviews' },
      { href: '/speakers', label: 'Speaker Lifecycle' }
    ],
    routes: ['/interviews', '/speakers'],
    permissions: ['leadership.view', 'leadership.manage']
  },
  {
    id: 'members',
    name: 'Members',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/members', label: 'Members' }],
    routes: ['/members'],
    permissions: ['members.view', 'members.manage']
  },
  {
    id: 'callings',
    name: 'Callings',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/callings', label: 'Callings' }],
    routes: ['/callings'],
    permissions: ['callings.view', 'callings.manage']
  },
  {
    id: 'membership-ordinances',
    name: 'Membership & Ordinances',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/membership-ordinances', label: 'Membership & Ordinances' }],
    routes: ['/membership-ordinances'],
    permissions: ['membership-ordinances.view', 'membership-ordinances.manage']
  },
  {
    id: 'notifications',
    name: 'Notifications',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/notifications', label: 'Notifications' }],
    routes: ['/notifications'],
    permissions: ['notifications.view', 'notifications.manage']
  },
  {
    id: 'announcements',
    name: 'Announcements',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/announcements', label: 'Announcements' }],
    routes: ['/announcements'],
    permissions: ['announcements.view', 'announcements.manage']
  },
  {
    id: 'reports',
    name: 'Reports',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/reports', label: 'Reports' }],
    routes: ['/reports'],
    permissions: ['reports.view']
  },
  {
    id: 'imports',
    name: 'Imports',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/imports', label: 'Imports' }],
    routes: ['/imports'],
    permissions: ['imports.run']
  },
  {
    id: 'support',
    name: 'Support Console',
    version: '1.0.0',
    defaultEnabled: true,
    navigation: [{ href: '/support', label: 'Support Console' }],
    routes: ['/support'],
    permissions: ['support.manage']
  }
];

export const DEFAULT_MODULE_REGISTRY: ModuleRegistry = {
  modules: MODULES,
  get(moduleId: string): ModuleDefinition | undefined {
    return MODULES.find((module) => module.id === moduleId);
  }
};

export function createModuleRegistry(modules: readonly ModuleDefinition[] = MODULES): ModuleRegistry {
  return {
    modules,
    get(moduleId: string): ModuleDefinition | undefined {
      return modules.find((module) => module.id === moduleId);
    }
  };
}
