import { documentLayoutSchema } from './schema';
import { downgradeToV1, isAdvancedLayout, mergeSimpleIntoAdvanced, normalizeToAdvanced, parseAdvancedLayout } from './advanced-schema';
import { getRegisteredBlockDefinition } from './registry';
import { isReusableBlockType } from './reusable-blocks';
import type { ProgramPermissionProfile } from '@/src/auth/roles';

export type TemplateDbRow = {
  id: string;
  template_key: string | null;
  scope_type: 'SYSTEM' | 'STAKE' | 'WARD' | 'PERSONAL_DRAFT';
  scope_id: string | null;
  document_type: 'SACRAMENT_PROGRAM';
  name: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  current_published_version_id: string | null;
  created_by_user_id: string | null;
  distribution_policy?: 'USE_AS_IS' | 'DUPLICATE_AND_CUSTOMIZE' | 'REQUIRED';
  source_template_id?: string | null;
  source_template_version?: number | null;
};

export type TemplateClient = {
  query: (text: string, values?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

export async function assertTemplateReusableReferences(
  client: TemplateClient,
  layoutInput: unknown,
  wardId: string,
  userId: string,
  scope: 'WARD' | 'PERSONAL' | 'STAKE' | 'SYSTEM' | 'WARD_CONTEXT'
): Promise<void> {
  const layout = isAdvancedLayout(layoutInput) ? parseAdvancedLayout(layoutInput) : normalizeToAdvanced(layoutInput);
  const references = layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks)).flatMap((block) => {
    const hasId = block.reusableBlockId !== undefined;
    const hasVersion = block.reusableBlockVersion !== undefined;
    if (hasId !== hasVersion) throw new Error('TEMPLATE_REUSABLE_REFERENCE_INVALID');
    if (!hasId) return [];
    return [{ id: String(block.reusableBlockId), version: Number(block.reusableBlockVersion), blockType: String(block.type) }];
  });
  if (scope === 'SYSTEM' && references.length > 0) throw new Error('TEMPLATE_REUSABLE_REFERENCE_FORBIDDEN');
  for (const reference of references) {
    if (!isReusableBlockType(reference.blockType as never)) throw new Error('TEMPLATE_REUSABLE_REFERENCE_INVALID');
    const scopePredicate = scope === 'STAKE'
      ? `b.scope_type = 'STAKE' AND b.scope_id = $4::uuid`
      : scope === 'PERSONAL'
        ? `b.scope_type = 'PERSONAL' AND b.scope_id = $4::uuid AND b.owner_user_id = $5::uuid`
        : scope === 'WARD'
          ? `b.scope_type = 'WARD' AND b.scope_id = $4::uuid`
          : `((b.scope_type = 'WARD' AND b.scope_id = $4::uuid)
              OR (b.scope_type = 'PERSONAL' AND b.scope_id = $4::uuid AND b.owner_user_id = $5::uuid)
              OR (b.scope_type = 'STAKE' AND EXISTS (SELECT 1 FROM ward w WHERE w.id = $4::uuid AND w.stake_id = b.scope_id)))`;
    const result = await client.query(
      `SELECT 1
         FROM reusable_block b
         JOIN reusable_block_version v ON v.reusable_block_id = b.id
        WHERE b.id = $1::uuid
          AND v.version = $2::integer
          AND b.block_type = $3
          AND b.current_version = v.version
          AND v.snapshot_json->>'version' = $2::text
          AND v.snapshot_json->>'blockType' = $3
          AND b.status = 'ACTIVE'
          AND ${scopePredicate}
        LIMIT 1`,
      [reference.id, reference.version, reference.blockType, wardId, userId]
    );
    if (!result.rows[0]) throw new Error('TEMPLATE_REUSABLE_REFERENCE_FORBIDDEN');
  }
}

const ADVANCED_BLOCK_METADATA_KEYS = ['styleOverrides', 'visibilityRule', 'digitalOrder'] as const;

function hasAdvancedBlockMetadata(block: unknown): boolean {
  return Boolean(block && typeof block === 'object' && ADVANCED_BLOCK_METADATA_KEYS.some((key) => Object.prototype.hasOwnProperty.call(block, key)));
}

function simpleBlockLayoutSemantics(block: unknown): unknown {
  if (!block || typeof block !== 'object') return undefined;
  const source = block as Record<string, unknown>;
  return {
    type: source.type,
    width: source.width,
    dataMode: source.dataMode,
    printBehavior: source.printBehavior,
    digitalBehavior: source.digitalBehavior
  };
}

function simpleBlockLayoutSemanticsChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(simpleBlockLayoutSemantics(previous)) !== JSON.stringify(simpleBlockLayoutSemantics(next));
}

function simpleBlockReferences(block: unknown): unknown {
  if (!block || typeof block !== 'object') return undefined;
  const source = block as Record<string, unknown>;
  return {
    source: source.source,
    reusableBlockId: source.reusableBlockId,
    reusableBlockVersion: source.reusableBlockVersion
  };
}

function simpleBlockReferencesChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(simpleBlockReferences(previous)) !== JSON.stringify(simpleBlockReferences(next));
}

function blockProtectedMetadata(block: unknown): Record<string, unknown> | undefined {
  if (!block || typeof block !== 'object') return undefined;
  const source = block as Record<string, unknown>;
  const metadata = Object.fromEntries(ADVANCED_BLOCK_METADATA_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function protectedMetadataChanged(previous: unknown, next: unknown): boolean {
  return JSON.stringify(blockProtectedMetadata(previous)) !== JSON.stringify(blockProtectedMetadata(next));
}

export function parseTemplateLayout(input: unknown) {
  if (isAdvancedLayout(input)) return parseAdvancedLayout(input);
  const layout = documentLayoutSchema.parse(input);
  return layout.fold === 'NONE' ? layout : downgradeToV1(normalizeToAdvanced(layout));
}

export function prepareTemplateVersionLayout(baseInput: unknown, incomingInput: unknown): ReturnType<typeof parseTemplateLayout> {
  const incoming = parseTemplateLayout(incomingInput);
  if (baseInput && isAdvancedLayout(baseInput) && !isAdvancedLayout(incomingInput)) {
    if (isAdvancedLayout(incoming)) throw new Error('Simple layout parser returned an Advanced layout');
    return mergeSimpleIntoAdvanced(parseAdvancedLayout(baseInput), incoming);
  }
  return isAdvancedLayout(incomingInput) ? incoming : normalizeToAdvanced(incoming);
}

/** Compare the complete identity, metadata, placement, and containing geometry of every advanced block across a version save. */
export function advancedBlocksChanged(
  previousInput: unknown,
  nextInput: unknown,
  options: { allowSimpleReusableReferences?: boolean; allowSimpleReusableAdditions?: boolean } = {}
): boolean {
  const previous = parseAdvancedLayout(previousInput);
  const next = parseAdvancedLayout(nextInput);
  if (JSON.stringify({ metadata: previous.metadata, lock: previous.lock }) !== JSON.stringify({ metadata: next.metadata, lock: next.lock })) return true;
  const comparableBlockIds = new Set(
    previous.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks.map((block) => String(block.id))))
      .filter((id) => next.pages.some((page) => page.regions.some((region) => region.blocks.some((block) => String(block.id) === id))))
  );
  const locate = (layout: typeof previous) => new Map(
    layout.pages.flatMap((page) => page.regions.flatMap((region) => region.blocks.map((block, blockIndex) => {
      const columnIndex = region.columns.blockIds.findIndex((column) => column.includes(block.id));
      return [
        block.id,
        {
          block,
          blockLock: block.lock,
          placement: JSON.stringify({ pageId: page.id, regionId: region.id, columnIndex }),
          context: JSON.stringify({
            page: { id: page.id, lock: page.lock },
            region: {
              id: region.id,
              lock: region.lock,
              ratio: region.ratio,
              gutter: region.gutter,
              face: region.face,
              columns: { ...region.columns, blockIds: region.columns.blockIds.map((column) => [...column].filter((blockId) => comparableBlockIds.has(String(blockId))).sort()) }
            },
            blockIndex,
            columnIndex
          })
        }
      ] as const;
    })))
  );
  const previousBlocks = locate(previous);
  const nextBlocks = locate(next);
  const locateRegionGeometry = (layout: typeof previous) => new Map(
    layout.pages.flatMap((page, pageIndex) => page.regions.map((region, regionIndex) => [
      `${page.id}:${region.id}`,
      JSON.stringify({
        pageId: page.id,
        pageLock: page.lock,
        pageIndex,
        regionId: region.id,
        regionLock: region.lock,
        regionIndex,
        ratio: region.ratio,
        gutter: region.gutter,
        face: region.face,
        columns: {
          ...region.columns,
          blockIds: region.columns.blockIds.map((column) => [...column].filter((blockId) => comparableBlockIds.has(String(blockId))).sort())
        }
      })
    ] as const))
  );
  const previousGeometry = locateRegionGeometry(previous);
  const nextGeometry = locateRegionGeometry(next);
  if (JSON.stringify({ paper: previous.paper, orientation: previous.orientation, fold: previous.fold, pageOrder: previous.pages.map((page) => page.id) }) !== JSON.stringify({ paper: next.paper, orientation: next.orientation, fold: next.fold, pageOrder: next.pages.map((page) => page.id) })) return true;
  for (const [id, geometry] of previousGeometry) {
    if (nextGeometry.get(id) !== geometry) return true;
  }
  for (const [id, geometry] of nextGeometry) {
    if (previousGeometry.get(id) !== geometry) return true;
  }
  const isAdvanced = (documentType: typeof previous.documentType, type: string) => {
    try {
      return getRegisteredBlockDefinition(documentType, type).exposure === 'ADVANCED';
    } catch {
      return true;
    }
  };
  for (const [id, entry] of previousBlocks) {
    const replacement = nextBlocks.get(id);
    if (protectedMetadataChanged(entry.block, replacement?.block) || JSON.stringify(entry.blockLock) !== JSON.stringify(replacement?.blockLock)) return true;
    if (replacement && simpleBlockLayoutSemanticsChanged(entry.block, replacement.block)) return true;
    if (!isAdvanced(previous.documentType, entry.block.type)) {
      if (!replacement || replacement.block.type !== entry.block.type || replacement.placement !== entry.placement) return true;
      if (!options.allowSimpleReusableReferences && simpleBlockReferencesChanged(entry.block, replacement.block)) return true;
      continue;
    }
    if (!replacement || JSON.stringify(entry.block) !== JSON.stringify(replacement.block) || entry.context !== replacement.context) return true;
  }
  for (const [id, entry] of nextBlocks) {
    const original = previousBlocks.get(id);
    if (protectedMetadataChanged(original?.block, entry.block) || JSON.stringify(original?.blockLock) !== JSON.stringify(entry.blockLock)) return true;
    if (original && simpleBlockLayoutSemanticsChanged(original.block, entry.block)) return true;
    if (!isAdvanced(next.documentType, entry.block.type)) {
      if (original && (original.block.type !== entry.block.type || original.placement !== entry.placement)) return true;
      if (original && !options.allowSimpleReusableReferences && simpleBlockReferencesChanged(original.block, entry.block)) return true;
      if (!original && (!options.allowSimpleReusableAdditions || hasAdvancedBlockMetadata(entry.block))) return true;
      continue;
    }
    if (!original || JSON.stringify(original.block) !== JSON.stringify(entry.block) || original.context !== entry.context) return true;
  }
  return false;
}

export function containsAdvancedLayoutStructure(input: unknown): boolean {
  return isAdvancedLayout(input);
}

export function containsAdvancedBlocks(input: unknown): boolean {
  const layout = parseAdvancedLayout(input);
  return layout.pages.some((page) => page.regions.some((region) => region.blocks.some((block) => {
    if (hasAdvancedBlockMetadata(block)) return true;
    try {
      return getRegisteredBlockDefinition(layout.documentType, block.type).exposure === 'ADVANCED';
    } catch {
      return true;
    }
  })));
}

export async function loadProgramPermissionProfile(client: TemplateClient, wardId: string): Promise<ProgramPermissionProfile> {
  const result = await client.query(
    `SELECT allow_program_editor_create_templates,
            allow_program_editor_publish,
            allow_program_editor_republish,
            allow_program_editor_rollback,
            allow_advanced_program_designer
       FROM ward_document_settings
      WHERE ward_id = $1::uuid
      LIMIT 1`,
    [wardId]
  );
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    allowProgramEditorCreateTemplates: row?.allow_program_editor_create_templates === true,
    allowProgramEditorPublish: row?.allow_program_editor_publish === true,
    allowProgramEditorRepublish: row?.allow_program_editor_republish === true,
    allowProgramEditorRollback: row?.allow_program_editor_rollback === true,
    allowAdvancedProgramDesigner: row?.allow_advanced_program_designer === true
  };
}

export function canEditTemplate(
  template: Pick<TemplateDbRow, 'scope_type' | 'scope_id' | 'created_by_user_id'>,
  wardId: string,
  userId: string,
  profile: ProgramPermissionProfile
): boolean {
  if (template.scope_type === 'WARD' && template.scope_id === wardId) return profile.allowProgramEditorCreateTemplates === true;
  if (template.scope_type === 'PERSONAL_DRAFT' && template.created_by_user_id === userId) return true;
  return false;
}

export function templateResponse(row: TemplateDbRow, version?: Record<string, unknown> | null) {
  return {
    id: row.id,
    key: row.template_key,
    source: row.scope_type === 'SYSTEM' ? 'BUILT_IN' : row.scope_type,
    scopeType: row.scope_type,
    name: row.name,
    description: row.description,
    documentType: row.document_type,
    status: row.status,
    distributionPolicy: row.distribution_policy ?? 'DUPLICATE_AND_CUSTOMIZE',
    sourceTemplateId: row.source_template_id ?? null,
    sourceTemplateVersion: row.source_template_version ?? null,
    version: version
      ? {
          id: version.id,
          version: version.version,
          schemaVersion: version.schema_version,
          layout: version.layout_json,
          theme: version.theme_json,
          lock: version.lock_json
        }
      : null
  };
}
