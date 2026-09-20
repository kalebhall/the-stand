import { z } from 'zod';

import { documentBlockBaseSchema } from './primitives';
import { DATA_MODES, DOCUMENT_TYPES, PRINT_BEHAVIORS, VISIBILITY_MODES } from './constants';
import type { DataMode, DocumentBlockBase, DocumentType, PrintBehavior, VisibilityMode } from './types';

export { safeUrlSchema } from './primitives';

export type BlockExposure = 'SIMPLE' | 'ADVANCED';
export type PublicationSafety = 'PUBLIC_SAFE' | 'PUBLIC_WITH_EXPLICIT_FIELDS' | 'INTERNAL_ONLY';
export type BlockCondition = 'HIDE_WHEN_EMPTY' | 'REQUIRES_MEETING_DATA' | 'REQUIRES_EXPLICIT_PUBLIC_FIELDS';

export interface BlockDefinition<TType extends string = string, TConfig = unknown> {
  readonly type: TType;
  /** Stable, human-authored identity for the config schema. Never derive this from Zod internals. */
  readonly schemaIdentity: string;
  /**
   * Stable, human-authored compatibility contract. Change it whenever the config shape changes;
   * registry compatibility must not depend on introspecting Zod internals.
   */
  readonly schemaContract: string;
  readonly allowedDataModes: readonly DataMode[];
  readonly exposure: BlockExposure;
  readonly publicationSafety: PublicationSafety;
  readonly defaultConfig: DeepReadonly<TConfig>;
  readonly applicableVisibility: readonly VisibilityMode[];
  readonly conditions: readonly BlockCondition[];
  readonly supportedTargets: readonly PrintBehavior[];
  readonly configSchema: z.ZodType<TConfig>;
}

export type DocumentBlockRegistryDefinition = Record<string, BlockDefinition>;

/** Recursively readonly values, used for exported catalogs and their configuration objects. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly DeepReadonly<TItem>[]
    : T extends object
      ? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
      : T;

/** Registry view allowed in public documents; every internal-only entry is excluded. */
export type PublicDocumentBlockRegistry<TRegistry extends DocumentBlockRegistryDefinition> = {
  [TType in keyof TRegistry as TRegistry[TType] extends { publicationSafety: 'INTERNAL_ONLY' } ? never : TType]: TRegistry[TType];
};

export type PublicDocumentBlockInput<TRegistry extends DocumentBlockRegistryDefinition> = {
  [TType in keyof PublicDocumentBlockRegistry<TRegistry>]: TType extends string
    ? Omit<DocumentBlockBase<TType>, 'id'> & {
        id: string;
        config: z.input<PublicDocumentBlockRegistry<TRegistry>[TType]['configSchema']>;
      }
    : never;
}[keyof PublicDocumentBlockRegistry<TRegistry>];

export type PublicDocumentBlockOutput<TRegistry extends DocumentBlockRegistryDefinition> = {
  [TType in keyof PublicDocumentBlockRegistry<TRegistry>]: TType extends string
    ? DocumentBlockBase<TType> & {
        config: z.output<PublicDocumentBlockRegistry<TRegistry>[TType]['configSchema']>;
      }
    : never;
}[keyof PublicDocumentBlockRegistry<TRegistry>];

export interface DocumentTypeDefinition<
  TType extends string = DocumentType,
  TRegistry extends DocumentBlockRegistryDefinition = DocumentBlockRegistryDefinition
> {
  readonly type: TType;
  readonly label: string;
  readonly blocks: TRegistry;
}

export const structuredText = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (value) =>
        !/[<>]/.test(value) &&
        !/\bjavascript\s*:/i.test(value) &&
        !/\b(?:style|script)\s*[:=]/i.test(value) &&
        !/\bon[a-z]+\s*=/i.test(value),
      'Markup and executable payloads are not allowed'
    );
export const boundedLabel = z.string().min(1).max(500);

const unique = (values: readonly string[]) => new Set(values).size === values.length;
const isPrintBehavior = (value: string): value is PrintBehavior => PRINT_BEHAVIORS.includes(value as PrintBehavior);

export function createDocumentBlockSchema<TRegistry extends DocumentBlockRegistryDefinition>(registry: TRegistry) {
  validateBlockRegistry(registry);
  const options = Object.values(registry).map((definition) =>
    documentBlockBaseSchema
      .extend({
        type: z.literal(definition.type),
        config: definition.configSchema
      })
      .superRefine((block, context) => {
        if (!definition.allowedDataModes.includes(block.dataMode)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataMode'], message: 'Data mode is not allowed for this block' });
        }
        if (!definition.applicableVisibility.includes(block.visibility)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['visibility'], message: 'Visibility is not allowed for this block' });
        }
        if (!definition.supportedTargets.includes(block.printBehavior)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['printBehavior'],
            message: 'Print behavior is not supported for this block'
          });
        }
        if (block.printBehavior === 'PRINT_ONLY' && block.digitalBehavior === 'LINK') {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['digitalBehavior'],
            message: 'PRINT_ONLY blocks cannot use digital links'
          });
        }
      })
  );
  if (options.length === 0) throw new Error('A document block registry must not be empty');
  return z.union(options as [(typeof options)[number], (typeof options)[number], ...typeof options]);
}

export function createPublicDocumentBlockSchema<TRegistry extends DocumentBlockRegistryDefinition>(
  registry: TRegistry,
  explicitPublicFields: readonly string[] = []
): z.ZodType<PublicDocumentBlockOutput<TRegistry>, z.ZodTypeDef, PublicDocumentBlockInput<TRegistry>> {
  validateBlockRegistry(registry);
  const publicRegistry = Object.fromEntries(
    Object.entries(registry).filter(([, definition]) => definition.publicationSafety !== 'INTERNAL_ONLY')
  ) as PublicDocumentBlockRegistry<TRegistry>;
  const explicit = new Set(explicitPublicFields);
  return createDocumentBlockSchema(publicRegistry).superRefine((block, context) => {
    const definition = publicRegistry[block.type as keyof typeof publicRegistry];
    if (definition.publicationSafety === 'PUBLIC_WITH_EXPLICIT_FIELDS' && !explicit.has(block.type)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Public fields must be explicitly configured' });
    }
    if (definition.publicationSafety === 'PUBLIC_WITH_EXPLICIT_FIELDS' && block.visibility !== 'VISIBLE') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['visibility'], message: 'Explicit public fields must be visible' });
    }
  }) as unknown as z.ZodType<PublicDocumentBlockOutput<TRegistry>, z.ZodTypeDef, PublicDocumentBlockInput<TRegistry>>;
}

const documentTypeRegistry = new Map<string, DocumentTypeDefinition<string, DocumentBlockRegistryDefinition>>();

function equivalentDefinitions(
  left: DocumentTypeDefinition<string, DocumentBlockRegistryDefinition>,
  right: DocumentTypeDefinition<string, DocumentBlockRegistryDefinition>
) {
  if (left.type !== right.type || left.label !== right.label) return false;
  const leftTypes = Object.keys(left.blocks);
  const rightTypes = Object.keys(right.blocks);
  if (leftTypes.length !== rightTypes.length || leftTypes.some((type) => !Object.prototype.hasOwnProperty.call(right.blocks, type)))
    return false;
  return leftTypes.every((type) => {
    const a = left.blocks[type];
    const b = right.blocks[type];
    return (
      a.type === b.type &&
      a.schemaIdentity === b.schemaIdentity &&
      a.schemaContract === b.schemaContract &&
      JSON.stringify(a.defaultConfig) === JSON.stringify(b.defaultConfig) &&
      JSON.stringify(a.allowedDataModes) === JSON.stringify(b.allowedDataModes) &&
      a.exposure === b.exposure &&
      a.publicationSafety === b.publicationSafety &&
      JSON.stringify(a.applicableVisibility) === JSON.stringify(b.applicableVisibility) &&
      JSON.stringify(a.conditions) === JSON.stringify(b.conditions) &&
      JSON.stringify(a.supportedTargets) === JSON.stringify(b.supportedTargets)
    );
  });
}

function validateDefinition(definition: DocumentTypeDefinition<string, DocumentBlockRegistryDefinition>) {
  if (!definition || typeof definition !== 'object' || typeof definition.type !== 'string' || typeof definition.label !== 'string') {
    throw new Error('Invalid document type definition');
  }
  if (!DOCUMENT_TYPES.includes(definition.type as DocumentType)) {
    throw new Error(`Unsupported document type: ${definition.type}`);
  }
  if (definition.label.trim().length === 0 || !definition.blocks || typeof definition.blocks !== 'object') {
    throw new Error(`Invalid document type definition: ${definition.type}`);
  }
  validateBlockRegistry(definition.blocks, definition.type);
}

function validateBlockRegistry(registry: DocumentBlockRegistryDefinition, documentType?: string): void {
  const registryLabel = documentType ? `: ${documentType}` : '';
  const prototype = Object.getPrototypeOf(registry);
  if (prototype !== null && prototype !== Object.prototype) {
    throw new Error(`Document block registry must not inherit block definitions${registryLabel}`);
  }
  const blocks = Object.entries(registry);
  if (blocks.length === 0) throw new Error(`Document type must define at least one block${registryLabel}`);

  for (const [key, block] of blocks) {
    if (!block || typeof block !== 'object' || key !== block.type) throw new Error(`Block key must match block type: ${key}`);
    if (typeof block.schemaIdentity !== 'string' || block.schemaIdentity.trim().length === 0) {
      throw new Error(`Invalid schema identity for block: ${block.type}`);
    }
    if (typeof block.schemaContract !== 'string' || block.schemaContract.trim().length === 0) {
      throw new Error(`Invalid schema contract for block: ${block.type}`);
    }
    if (!['SIMPLE', 'ADVANCED'].includes(block.exposure)) throw new Error(`Invalid exposure for block: ${block.type}`);
    if (!['PUBLIC_SAFE', 'PUBLIC_WITH_EXPLICIT_FIELDS', 'INTERNAL_ONLY'].includes(block.publicationSafety)) {
      throw new Error(`Invalid publication safety for block: ${block.type}`);
    }
    if (
      !Array.isArray(block.allowedDataModes) ||
      block.allowedDataModes.length === 0 ||
      !unique(block.allowedDataModes) ||
      block.allowedDataModes.some((mode) => !DATA_MODES.includes(mode))
    ) {
      throw new Error(`Invalid allowed data modes for block: ${block.type}`);
    }
    if (
      !Array.isArray(block.applicableVisibility) ||
      block.applicableVisibility.length === 0 ||
      !unique(block.applicableVisibility) ||
      block.applicableVisibility.some((mode) => !VISIBILITY_MODES.includes(mode))
    ) {
      throw new Error(`Invalid applicable visibility for block: ${block.type}`);
    }
    if (
      !Array.isArray(block.conditions) ||
      !unique(block.conditions) ||
      block.conditions.some(
        (condition) => !['HIDE_WHEN_EMPTY', 'REQUIRES_MEETING_DATA', 'REQUIRES_EXPLICIT_PUBLIC_FIELDS'].includes(condition)
      )
    ) {
      throw new Error(`Invalid conditions for block: ${block.type}`);
    }
    const hasExplicitCondition = block.conditions.includes('REQUIRES_EXPLICIT_PUBLIC_FIELDS');
    if ((block.publicationSafety === 'PUBLIC_WITH_EXPLICIT_FIELDS') !== hasExplicitCondition) {
      throw new Error(`Publication safety and conditions are incoherent for block: ${block.type}`);
    }
    if (block.conditions.includes('HIDE_WHEN_EMPTY') && !block.applicableVisibility.includes('HIDE_WHEN_EMPTY')) {
      throw new Error(`HIDE_WHEN_EMPTY condition requires applicable visibility for block: ${block.type}`);
    }
    if (
      !Array.isArray(block.supportedTargets) ||
      block.supportedTargets.length === 0 ||
      !unique(block.supportedTargets) ||
      block.supportedTargets.some((target) => !isPrintBehavior(target))
    ) {
      throw new Error(`Invalid supported targets for block: ${block.type}`);
    }
    if (
      !block.configSchema ||
      typeof block.configSchema.safeParse !== 'function' ||
      !block.configSchema.safeParse(block.defaultConfig).success
    ) {
      throw new Error(`Invalid default configuration for block: ${block.type}`);
    }
  }
}

function freezeImmutableValue(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const nestedValue of Object.values(value)) freezeImmutableValue(nestedValue, seen);
  Object.freeze(value);
}

function freezeDefinition<T extends DocumentTypeDefinition<string, DocumentBlockRegistryDefinition>>(definition: T): T {
  Object.freeze(definition.blocks);
  for (const block of Object.values(definition.blocks)) {
    Object.freeze(block.allowedDataModes);
    Object.freeze(block.applicableVisibility);
    Object.freeze(block.conditions);
    Object.freeze(block.supportedTargets);
    freezeImmutableValue(block.defaultConfig);
    Object.freeze(block);
  }
  return Object.freeze(definition);
}

export function registerDocumentType<TType extends string, TRegistry extends DocumentBlockRegistryDefinition>(
  definition: DocumentTypeDefinition<TType, TRegistry>
): DocumentTypeDefinition<TType, TRegistry> {
  validateDefinition(definition as DocumentTypeDefinition<string, DocumentBlockRegistryDefinition>);
  const existing = documentTypeRegistry.get(definition.type);
  if (existing) {
    if (equivalentDefinitions(existing, definition as DocumentTypeDefinition<string, DocumentBlockRegistryDefinition>)) {
      return existing as DocumentTypeDefinition<TType, TRegistry>;
    }
    throw new Error(`Document type already registered: ${definition.type}`);
  }
  const frozenDefinition = freezeDefinition(definition as DocumentTypeDefinition<string, DocumentBlockRegistryDefinition>);
  documentTypeRegistry.set(definition.type, frozenDefinition);
  return frozenDefinition as DocumentTypeDefinition<TType, TRegistry>;
}

export function getDocumentTypeDefinition(type: string): DocumentTypeDefinition<string, DocumentBlockRegistryDefinition> {
  const definition = documentTypeRegistry.get(type);
  if (!definition) throw new Error(`Unknown document type: ${type}`);
  return definition;
}

export function getRegisteredBlockDefinition(documentType: string, blockType: string): BlockDefinition {
  const definition = getDocumentTypeDefinition(documentType);
  const block = Object.prototype.hasOwnProperty.call(definition.blocks, blockType) ? definition.blocks[blockType] : undefined;
  if (!block) throw new Error(`Unknown block type: ${blockType}`);
  return block;
}

export function getRegisteredDocumentTypes(): readonly string[] {
  return [...documentTypeRegistry.keys()];
}

/** Test-only reset hook; callers must re-register definitions through registerDocumentType. */
export function resetDocumentTypeRegistryForTests(): void {
  documentTypeRegistry.clear();
}

export type RuntimeRegisteredBlock<TRegistry extends DocumentBlockRegistryDefinition> = {
  [TType in keyof TRegistry]: TType extends string
    ? DocumentBlockBase<TType> & { config: z.output<TRegistry[TType]['configSchema']> }
    : never;
}[keyof TRegistry];
