import type { ModuleDefinition, ModuleRegistry } from './types';
import { technologyChecklistModule } from './technology-checklist';

export const CORE_MODULE_ID = 'conducting-core';

const MODULES: readonly ModuleDefinition[] = [
  {
    id: CORE_MODULE_ID,
    name: 'Conducting Core',
    description: 'Prepare, conduct, publish, and preserve the sacrament meeting workflow.',
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
    description: 'Create and manage meeting programs, templates, and printable program layouts.',
    version: '1.0.0',
    defaultEnabled: false,
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
    description: 'Organize bishopric agenda items and follow-up actions alongside meetings.',
    version: '1.0.0',
    defaultEnabled: false,
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
    description: 'Schedule interviews and manage speaker lifecycle information.',
    defaultEnabled: false,
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
    description: 'Maintain ward member information and member-focused workflow views.',
    version: '1.0.0',
    defaultEnabled: false,
    navigation: [{ href: '/members', label: 'Members' }],
    routes: ['/members'],
    permissions: ['members.view', 'members.manage']
  },
  {
    id: 'callings',
    name: 'Callings',
    description: 'Track calling assignments, sustaining, setting apart, extensions, and releases.',
    version: '1.0.0',
    defaultEnabled: false,
    navigation: [{ href: '/callings', label: 'Callings' }],
    routes: ['/callings'],
    permissions: ['callings.view', 'callings.manage']
  },
  {
    id: 'membership-ordinances',
    name: 'Membership & Ordinances',
    description: 'Coordinate membership and ordinance follow-up records for the ward.',
    version: '1.0.0',
    defaultEnabled: false,
    navigation: [{ href: '/membership-ordinances', label: 'Membership & Ordinances' }],
    routes: ['/membership-ordinances'],
    permissions: ['membership-ordinances.view', 'membership-ordinances.manage']
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Deliver in-app workflow notifications and optional email notifications.',
    version: '1.0.0',
    defaultEnabled: false,
    navigation: [{ href: '/notifications', label: 'Notifications' }],
    routes: ['/notifications'],
    permissions: ['notifications.view', 'notifications.manage']
  },
  {
    id: 'announcements',
    name: 'Announcements',
    description: 'Draft, publish, schedule, and retire ward announcements.',
    version: '1.0.0',
    defaultEnabled: false,
    navigation: [{ href: '/announcements', label: 'Announcements' }],
    routes: ['/announcements'],
    permissions: ['announcements.view', 'announcements.manage']
  },
  {
    id: 'reports',
    name: 'Reports',
    description: 'Review activity and meeting reports for ward planning and follow-up.',
    version: '1.0.0',
    defaultEnabled: false,
    navigation: [{ href: '/reports', label: 'Reports' }],
    routes: ['/reports'],
    permissions: ['reports.view']
  },
  {
    id: 'imports',
    name: 'Imports',
    description: 'Import approved calendar, calling, membership, and other operational data.',
    version: '1.0.0',
    defaultEnabled: false,
    navigation: [{ href: '/imports', label: 'Imports' }],
    routes: ['/imports'],
    permissions: ['imports.run']
  },
  {
    id: 'support',
    name: 'Support Console',
    description: 'Provide authorized support and access-request tools for system administrators.',
    version: '1.0.0',
    defaultEnabled: false,
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
