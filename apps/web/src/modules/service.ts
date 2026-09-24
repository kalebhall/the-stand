import { pool } from '@/src/db/client';
import { recordAuditEvent } from '@/src/audit/service';
import { setDbContext } from '@/src/db/context';
import { CORE_MODULE_ID, DEFAULT_MODULE_REGISTRY } from './registry';
import type { ModuleDefinition, ModuleRegistry } from './types';

export type EffectiveModuleSetting = {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  defaultEnabled: boolean;
  overridden: boolean;
  canDisable: boolean;
};

type OverrideRow = {
  module_id: string;
  enabled: boolean;
};

export function validateModuleChange(registry: ModuleRegistry, moduleId: string, enabled: boolean): ModuleDefinition {
  const module = registry.get(moduleId);
  if (!module) throw new Error(`Unknown module: ${moduleId}`);
  if (module.id === CORE_MODULE_ID && !enabled) throw new Error('Conducting Core cannot be disabled');
  return module;
}

export function buildEffectiveModuleSettings(
  registry: ModuleRegistry,
  overrides: ReadonlyMap<string, boolean>
): EffectiveModuleSetting[] {
  return registry.modules.map((module) => {
    const overridden = overrides.has(module.id);
    const enabled = module.id === CORE_MODULE_ID ? true : overrides.get(module.id) ?? module.defaultEnabled;
    return {
      id: module.id,
      name: module.name,
      description: module.description,
      version: module.version,
      enabled,
      defaultEnabled: module.defaultEnabled,
      overridden,
      canDisable: module.id !== CORE_MODULE_ID
    };
  });
}

function rowsToOverrides(rows: readonly OverrideRow[]): Map<string, boolean> {
  return new Map(rows.map((row) => [row.module_id, row.enabled]));
}

async function withWardTransaction<T>(wardId: string, userId: string, operation: (client: Awaited<ReturnType<typeof pool.connect>>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { wardId, userId });
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function readOverrides(client: Awaited<ReturnType<typeof pool.connect>>): Promise<OverrideRow[]> {
  const result = await client.query(
    'SELECT module_id, enabled FROM ward_module_enablement WHERE ward_id = app.current_ward_id() ORDER BY module_id'
  );
  return result.rows as OverrideRow[];
}

export async function getWardModuleSettings(
  wardId: string,
  userId: string,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
): Promise<EffectiveModuleSetting[]> {
  return withWardTransaction(wardId, userId, async (client) => buildEffectiveModuleSettings(registry, rowsToOverrides(await readOverrides(client))));
}

export async function isWardModuleEnabled(
  wardId: string,
  userId: string,
  moduleId: string,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
): Promise<boolean> {
  const modules = await getWardModuleSettings(wardId, userId, registry);
  return modules.find((module) => module.id === moduleId)?.enabled ?? false;
}

export async function setWardModuleEnabled(
  wardId: string,
  userId: string,
  moduleId: string,
  enabled: boolean,
  registry: ModuleRegistry = DEFAULT_MODULE_REGISTRY
): Promise<EffectiveModuleSetting[]> {
  validateModuleChange(registry, moduleId, enabled);
  return withWardTransaction(wardId, userId, async (client) => {
    const previous = await client.query(
      'SELECT module_id, enabled FROM ward_module_enablement WHERE ward_id = app.current_ward_id() AND module_id = $1::text FOR UPDATE',
      [moduleId]
    );
    await client.query(
      `INSERT INTO ward_module_enablement (ward_id, module_id, enabled, updated_by_user_id, updated_at)
       VALUES (app.current_ward_id(), $1::text, $2::boolean, app.current_user_id(), now())
       ON CONFLICT (ward_id, module_id) DO UPDATE
       SET enabled = EXCLUDED.enabled, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = EXCLUDED.updated_at`,
      [moduleId, enabled]
    );
    await recordAuditEvent(client, {
      wardId,
      userId,
      action: 'WARD_MODULE_ENABLEMENT_CHANGED',
      entityType: 'ward_module_enablement',
      entityId: moduleId,
      changes: { enabled: { old: previous.rows[0]?.enabled ?? null, new: enabled } },
      details: { moduleId },
      source: 'api',
      severity: 'notice'
    });
    return buildEffectiveModuleSettings(registry, rowsToOverrides(await readOverrides(client)));
  });
}
