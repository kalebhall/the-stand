import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { SACRAMENT_PROGRAM_BLOCK_TYPES, sacramentProgramRegistry, sacramentProgramTypeDefinition } from './sacrament-program';
import {
  createDocumentBlockSchema,
  createPublicDocumentBlockSchema,
  getDocumentTypeDefinition,
  getRegisteredBlockDefinition,
  getRegisteredDocumentTypes,
  registerDocumentType,
  resetDocumentTypeRegistryForTests
} from './registry';

const validBase = {
  id: '11111111-1111-4111-8111-111111111111',
  width: 'FULL',
  dataMode: 'MANUAL',
  visibility: 'VISIBLE',
  printBehavior: 'PRINT_AND_DIGITAL',
  digitalBehavior: 'NORMAL'
} as const;

describe('document designer registry', () => {
  it('contains the complete initial sacrament-program catalog', () => {
    expect(Object.keys(sacramentProgramRegistry)).toEqual([...SACRAMENT_PROGRAM_BLOCK_TYPES]);
    expect(SACRAMENT_PROGRAM_BLOCK_TYPES).toHaveLength(30);
    for (const type of SACRAMENT_PROGRAM_BLOCK_TYPES) {
      expect(sacramentProgramRegistry[type].type).toBe(type);
      expect(sacramentProgramRegistry[type].configSchema).toBeDefined();
      expect(sacramentProgramRegistry[type].defaultConfig).toBeDefined();
      expect(sacramentProgramRegistry[type].allowedDataModes.length).toBeGreaterThan(0);
      expect(sacramentProgramRegistry[type].exposure).toMatch(/^(SIMPLE|ADVANCED)$/);
      expect(['PUBLIC_SAFE', 'PUBLIC_WITH_EXPLICIT_FIELDS', 'INTERNAL_ONLY']).toContain(sacramentProgramRegistry[type].publicationSafety);
    }
  });

  it('exposes an immutable sacrament-program catalog', () => {
    expect(Object.isFrozen(sacramentProgramRegistry)).toBe(true);
    expect(Object.isFrozen(sacramentProgramRegistry.DOCUMENT_TITLE)).toBe(true);
    expect(() => {
      (sacramentProgramRegistry as { DOCUMENT_TITLE: unknown }).DOCUMENT_TITLE = undefined;
    }).toThrow();
    expect(() => {
      (sacramentProgramRegistry.DOCUMENT_TITLE.defaultConfig as { text: string }).text = 'Changed';
    }).toThrow();
  });

  it('registers SACRAMENT_PROGRAM and rejects unknown document types', () => {
    const registered = getDocumentTypeDefinition('SACRAMENT_PROGRAM');
    expect(registered).toBe(sacramentProgramTypeDefinition);
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.blocks)).toBe(true);
    expect(Object.isFrozen(registered.blocks.DOCUMENT_TITLE.defaultConfig)).toBe(true);
    expect(() => {
      (registered.blocks.DOCUMENT_TITLE.defaultConfig as { text: string }).text = 'Changed';
    }).toThrow();
    expect(() => getDocumentTypeDefinition('BAPTISM' as never)).toThrow(/Unknown document type/);
    expect(() => registerDocumentType({ ...sacramentProgramTypeDefinition, type: 'BAPTISM' } as never)).toThrow(
      /already registered|Unsupported/
    );
  });

  it('exposes block lookup without accepting unknown block types', () => {
    expect(getRegisteredBlockDefinition('SACRAMENT_PROGRAM', 'MEETING_PROGRAM')).toBe(sacramentProgramRegistry.MEETING_PROGRAM);
    expect(() => getRegisteredBlockDefinition('SACRAMENT_PROGRAM', 'UNKNOWN' as never)).toThrow(/Unknown block type/);
    expect(() => getRegisteredBlockDefinition('SACRAMENT_PROGRAM', '__proto__')).toThrow(/Unknown block type/);
    expect(() => getRegisteredBlockDefinition('SACRAMENT_PROGRAM', 'constructor')).toThrow(/Unknown block type/);
    expect(getRegisteredDocumentTypes()).toEqual(['SACRAMENT_PROGRAM']);
  });

  it('validates narrow config schemas and rejects arbitrary config', () => {
    const schema = createDocumentBlockSchema(sacramentProgramRegistry);
    expect(schema.safeParse({ ...validBase, type: 'CUSTOM_TEXT', config: { text: 'Welcome', unexpected: true } }).success).toBe(false);
    expect(schema.safeParse({ ...validBase, type: 'IMAGE', config: { assetId: null, alt: '', isDecorative: true } }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, type: 'IMAGE', config: { src: 'https://example.com/a.png', alt: 'A' } }).success).toBe(false);
    expect(schema.safeParse({ ...validBase, type: 'CUSTOM_TEXT', config: { text: '<script>alert(1)</script>' } }).success).toBe(false);
    expect(
      schema.safeParse({ ...validBase, type: 'CUSTOM_TEXT', lock: { level: 'NONE', properties: ['CONTENT'] }, config: { text: 'Welcome' } })
        .success
    ).toBe(false);
  });

  it('validates every registry default against its config schema', () => {
    for (const definition of Object.values(sacramentProgramRegistry)) {
      expect(definition.configSchema.safeParse(definition.defaultConfig).success).toBe(true);
    }
  });

  it('marks private leadership and missionary blocks internal-only', () => {
    expect(sacramentProgramRegistry.WARD_LEADERSHIP.publicationSafety).toBe('INTERNAL_ONLY');
    expect(sacramentProgramRegistry.MISSIONARIES_ASSIGNED.publicationSafety).toBe('INTERNAL_ONLY');
    expect(sacramentProgramRegistry.MEETING_PROGRAM.publicationSafety).toBe('PUBLIC_WITH_EXPLICIT_FIELDS');
  });

  it('filters any custom internal-only key from public types and runtime schemas', () => {
    const customRegistry = {
      PUBLIC_CUSTOM: {
        ...sacramentProgramRegistry.CUSTOM_TEXT,
        type: 'PUBLIC_CUSTOM' as const,
        publicationSafety: 'PUBLIC_SAFE' as const,
        conditions: [] as const
      },
      SECRET_CUSTOM: {
        ...sacramentProgramRegistry.CUSTOM_TEXT,
        type: 'SECRET_CUSTOM' as const,
        publicationSafety: 'INTERNAL_ONLY' as const,
        conditions: ['REQUIRES_MEETING_DATA'] as const
      }
    };
    const schema = createPublicDocumentBlockSchema(customRegistry);
    type PublicInput = z.input<typeof schema>;
    const rawId: PublicInput['id'] = 'not-branded-at-the-input-boundary';
    const publicType: PublicInput['type'] = 'PUBLIC_CUSTOM';
    // @ts-expect-error Any registry entry marked INTERNAL_ONLY must be excluded.
    const privateType: PublicInput['type'] = 'SECRET_CUSTOM';

    expect(rawId).toBe('not-branded-at-the-input-boundary');
    expect(publicType).toBe('PUBLIC_CUSTOM');
    expect(privateType).toBe('SECRET_CUSTOM');
    expect(schema.safeParse({ ...validBase, type: 'PUBLIC_CUSTOM', config: { text: 'Public' } }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, type: 'SECRET_CUSTOM', config: { text: 'Private' } }).success).toBe(false);
  });

  it('exposes deeply readonly catalog configuration types', () => {
    expect(() => {
      (sacramentProgramRegistry as { DOCUMENT_TITLE: unknown }).DOCUMENT_TITLE = sacramentProgramRegistry.DOCUMENT_TITLE;
    }).toThrow();
    expect(() => {
      // @ts-expect-error Nested default configuration is readonly in TypeScript.
      sacramentProgramRegistry.MEETING_PROGRAM.defaultConfig.items.push({ order: 1, kind: 'OTHER', label: 'x' });
    }).toThrow();
    expect(Object.isFrozen(sacramentProgramRegistry.MEETING_PROGRAM.defaultConfig.items)).toBe(true);
  });

  it('models MEETING_PROGRAM as one ordered aggregate block', () => {
    const definition = sacramentProgramRegistry.MEETING_PROGRAM;
    expect(definition.configSchema.safeParse({ items: [{ kind: 'HYMN', label: 'Opening hymn', order: 1 }] }).success).toBe(true);
    expect(definition.configSchema.safeParse({ kind: 'HYMN', label: 'Opening hymn' }).success).toBe(false);
    expect(
      definition.configSchema.safeParse({
        items: [
          { kind: 'HYMN', label: 'Opening hymn', order: 2 },
          { kind: 'PRAYER', label: 'Opening prayer', order: 1 }
        ]
      }).success
    ).toBe(false);
    expect(
      definition.configSchema.safeParse({
        items: [
          { kind: 'HYMN', label: 'Opening hymn', order: 1 },
          { kind: 'PRAYER', label: 'Opening prayer', order: 1 }
        ]
      }).success
    ).toBe(false);
    expect(definition.defaultConfig).toHaveProperty('items');
  });

  it('accepts equivalent independently-created definitions and rejects conflicting definitions', () => {
    expect(registerDocumentType(sacramentProgramTypeDefinition)).toBe(sacramentProgramTypeDefinition);
    expect(() => registerDocumentType({ ...sacramentProgramTypeDefinition, label: 'Different label' })).toThrow(/already registered/);

    resetDocumentTypeRegistryForTests();
    const makeDefinition = () => ({
      type: 'SACRAMENT_PROGRAM' as const,
      label: 'Sacrament Program',
      blocks: {
        DOCUMENT_TITLE: {
          type: 'DOCUMENT_TITLE' as const,
          schemaIdentity: 'test/document-title/v1',
          schemaContract: 'test/document-title/config-v1',
          allowedDataModes: ['MANUAL'] as const,
          exposure: 'SIMPLE' as const,
          publicationSafety: 'PUBLIC_SAFE' as const,
          defaultConfig: { text: 'Title' },
          applicableVisibility: ['VISIBLE'] as const,
          conditions: [] as const,
          supportedTargets: ['PRINT_AND_DIGITAL'] as const,
          configSchema: z.object({ text: z.string() }).strict()
        }
      }
    });

    try {
      const first = makeDefinition();
      registerDocumentType(first);
      expect(registerDocumentType(makeDefinition())).toBe(first);
      expect(() =>
        registerDocumentType({
          ...first,
          blocks: { ...first.blocks, DOCUMENT_TITLE: { ...first.blocks.DOCUMENT_TITLE, schemaContract: 'test/document-title/config-v2' } }
        })
      ).toThrow(/already registered/);
    } finally {
      resetDocumentTypeRegistryForTests();
      registerDocumentType(sacramentProgramTypeDefinition);
    }
  });

  it('rejects invalid default configurations before registration', () => {
    expect(() =>
      registerDocumentType({
        type: 'SACRAMENT_PROGRAM',
        label: 'Invalid',
        blocks: {
          DOCUMENT_TITLE: {
            ...sacramentProgramRegistry.DOCUMENT_TITLE,
            defaultConfig: { text: '<script>' }
          }
        }
      })
    ).toThrow(/Invalid default configuration/);
  });

  it('accepts registered blocks and rejects unknown types at runtime', () => {
    const schema = createDocumentBlockSchema(sacramentProgramRegistry);
    expect(schema.safeParse({ ...validBase, dataMode: 'AUTO', type: 'WARD_NAME', config: { text: 'Oak Ward' } }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, type: 'NOT_REGISTERED', config: {} }).success).toBe(false);
  });

  it('requires the block print behavior to be one of its supported targets', () => {
    const printOnlySchema = createDocumentBlockSchema({
      TEST: { ...sacramentProgramRegistry.CUSTOM_TEXT, type: 'TEST', supportedTargets: ['PRINT_AND_DIGITAL'] as const }
    });
    expect(printOnlySchema.safeParse({ ...validBase, type: 'TEST', printBehavior: 'PRINT_ONLY', config: { text: 'x' } }).success).toBe(
      false
    );
    expect(printOnlySchema.safeParse({ ...validBase, type: 'TEST', printBehavior: 'DIGITAL_ONLY', config: { text: 'x' } }).success).toBe(
      false
    );
    expect(printOnlySchema.safeParse({ ...validBase, type: 'TEST', config: { text: 'x' } }).success).toBe(true);
  });

  it('rejects malformed definitions before storing them', () => {
    resetDocumentTypeRegistryForTests();
    try {
      const base = sacramentProgramRegistry.DOCUMENT_TITLE;
      expect(() =>
        registerDocumentType({
          type: 'SACRAMENT_PROGRAM',
          label: 'Malformed',
          blocks: { WRONG_KEY: base }
        } as never)
      ).toThrow(/Block key/);
      expect(getRegisteredDocumentTypes()).toEqual([]);
      expect(() =>
        registerDocumentType({
          type: 'SACRAMENT_PROGRAM',
          label: 'Malformed',
          blocks: { DOCUMENT_TITLE: { ...base, supportedTargets: ['PRINT_AND_DIGITAL', 'PRINT_AND_DIGITAL'] } }
        } as never)
      ).toThrow(/supported targets/);
      expect(getRegisteredDocumentTypes()).toEqual([]);
    } finally {
      registerDocumentType(sacramentProgramTypeDefinition);
    }
  });

  it('validates arbitrary registries before composing block schemas', () => {
    const malformedRegistry = {
      WRONG_KEY: { ...sacramentProgramRegistry.DOCUMENT_TITLE, type: 'DOCUMENT_TITLE' }
    };
    expect(() => createDocumentBlockSchema(malformedRegistry as never)).toThrow(/Block key/);
    expect(() =>
      createDocumentBlockSchema({
        DOCUMENT_TITLE: { ...sacramentProgramRegistry.DOCUMENT_TITLE, defaultConfig: { text: '<script>' } }
      } as never)
    ).toThrow(/Invalid default configuration/);
  });

  it('rejects inherited block keys before registration or equivalence lookup', () => {
    resetDocumentTypeRegistryForTests();
    try {
      const inheritedBlocks = Object.create({ INHERITED: sacramentProgramRegistry.DOCUMENT_TITLE }) as Record<string, unknown>;
      inheritedBlocks.DOCUMENT_TITLE = sacramentProgramRegistry.DOCUMENT_TITLE;
      expect(() =>
        registerDocumentType({
          type: 'SACRAMENT_PROGRAM',
          label: 'Sacrament Program',
          blocks: inheritedBlocks
        } as never)
      ).toThrow(/must not inherit/);
      expect(getRegisteredDocumentTypes()).toEqual([]);
    } finally {
      registerDocumentType(sacramentProgramTypeDefinition);
    }
  });
});
