import { z } from 'zod';

import {
  createDocumentBlockSchema,
  registerDocumentType,
  type BlockDefinition,
  type BlockCondition,
  type BlockExposure,
  type PublicationSafety,
  type DocumentTypeDefinition,
  structuredText,
  safeUrlSchema,
  boundedLabel
} from './registry';
import type { DeepReadonly } from './registry';
import { createDocumentLayoutSchema } from './primitives';

import {
  ANNOUNCEMENT_LIST_PRESENTATIONS,
  BLOCK_TYPES,
  MEETING_PROGRAM_PRESENTATIONS,
  SECTION_HEADING_PRESENTATIONS,
  SIMPLE_LIST_PRESENTATIONS
} from './constants';

export const SACRAMENT_PROGRAM_BLOCK_TYPES = BLOCK_TYPES;

export type SacramentProgramBlockType = (typeof SACRAMENT_PROGRAM_BLOCK_TYPES)[number];
const textConfig = z.object({ text: structuredText(10_000) }).strict();
const titleConfig = z.object({ text: structuredText(500) }).strict();
const publicText = (max: number) => z.string().trim().max(max).pipe(structuredText(max));
const publicLabel = (max = 500) => z.string().trim().min(1).max(max).pipe(structuredText(max));
const meetingInfoConfig = z.object({ includeDate: z.boolean(), includeTime: z.boolean(), includeLocation: z.boolean() }).strict();
const meetingItem = z
  .object({
    order: z.number().int().min(0).max(200),
    kind: z.enum(['OPENING', 'HYMN', 'PRAYER', 'SPEAKER', 'ORDINANCE', 'CLOSING', 'OTHER']),
    label: boundedLabel,
    details: structuredText(2_000).optional()
  })
  .strict();
const meetingProgramConfig = z
  .object({ items: z.array(meetingItem).max(100), presentation: z.enum(MEETING_PROGRAM_PRESENTATIONS).default('LABEL_VALUE') })
  .strict()
  .superRefine(({ items }, context) => {
    for (let index = 1; index < items.length; index += 1) {
      if (items[index].order <= items[index - 1].order) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'order'],
          message: 'Meeting program orders must be unique and ascending'
        });
      }
    }
  });
const announcementItem = z
  .object({
    id: z.string().uuid(),
    order: z.number().int().min(0).max(99),
    date: publicText(160).optional(),
    time: publicText(80).optional(),
    title: publicLabel(),
    description: structuredText(2_000).optional(),
    location: publicText(300).optional(),
    contact: publicText(300).optional()
  })
  .strict();
const announcementListConfig = z
  .object({ items: z.array(announcementItem).max(100), presentation: z.enum(ANNOUNCEMENT_LIST_PRESENTATIONS).default('COMPACT_ROWS') })
  .strict()
  .superRefine(({ items }, context) => {
    const seenIds = new Set<string>();
    for (let index = 0; index < items.length; index += 1) {
      if (seenIds.has(items[index].id))
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'id'], message: 'Announcement item IDs must be unique' });
      seenIds.add(items[index].id);
      if (index > 0 && items[index].order <= items[index - 1].order)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'order'],
          message: 'Announcement orders must be unique and ascending'
        });
    }
  });
const sectionHeadingConfig = z
  .object({
    title: publicLabel(),
    subtitle: structuredText(500).optional(),
    presentation: z.enum(SECTION_HEADING_PRESENTATIONS).default('RULE')
  })
  .strict();
const simpleListItem = z
  .object({
    id: z.string().uuid(),
    order: z.number().int().min(0).max(99),
    text: structuredText(300).refine((value) => value.trim().length > 0, 'List items must not be empty')
  })
  .strict();
const simpleListConfig = z
  .object({ items: z.array(simpleListItem).max(100), presentation: z.enum(SIMPLE_LIST_PRESENTATIONS).default('BULLETS') })
  .strict()
  .superRefine(({ items }, context) => {
    const seenIds = new Set<string>();
    for (let index = 0; index < items.length; index += 1) {
      if (seenIds.has(items[index].id))
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'id'], message: 'List item IDs must be unique' });
      seenIds.add(items[index].id);
      if (index > 0 && items[index].order <= items[index - 1].order)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'order'],
          message: 'List orders must be unique and ascending'
        });
    }
  });

const imageConfig = z
  .object({
    assetId: z.string().uuid().nullable(),
    alt: structuredText(500),
    isDecorative: z.boolean()
  })
  .strict();
const linkConfig = z.object({ label: boundedLabel, href: safeUrlSchema }).strict();
const qrConfig = z.object({ href: safeUrlSchema.nullable(), label: z.string().trim().max(500) }).strict();
const spacerConfig = z.object({ height: z.number().finite().positive().max(720) }).strict();
const dividerConfig = z.object({ style: z.enum(['SOLID', 'DOTTED']) }).strict();

function definition<
  TType extends SacramentProgramBlockType,
  TSchema extends z.ZodTypeAny,
  const TOptions extends {
    allowedDataModes: readonly import('./types').DataMode[];
    exposure: BlockExposure;
    publicationSafety: PublicationSafety;
    applicableVisibility: readonly import('./types').VisibilityMode[];
    conditions: readonly BlockCondition[];
  }
>(
  type: TType,
  configSchema: TSchema,
  defaultConfig: z.output<TSchema>,
  options: TOptions,
  schemaVersion = 1
): BlockDefinition<TType, z.output<TSchema>> & TOptions {
  return {
    type,
    schemaIdentity: `sacrament-program/${type}/v${schemaVersion}`,
    schemaContract: `sacrament-program/${type}/config-v${schemaVersion}`,
    configSchema,
    defaultConfig,
    supportedTargets: ['PRINT_AND_DIGITAL'],
    ...options
  } as unknown as BlockDefinition<TType, z.output<TSchema>> & TOptions;
}

const allModes = ['AUTO', 'AUTO_OVERRIDE', 'MANUAL'] as const;
const automaticModes = ['AUTO', 'AUTO_OVERRIDE'] as const;
const visible = ['VISIBLE', 'HIDDEN', 'HIDE_WHEN_EMPTY'] as const;
const publicSafe = { exposure: 'SIMPLE', publicationSafety: 'PUBLIC_SAFE', applicableVisibility: visible, conditions: [] } as const;
const publicFields = {
  exposure: 'ADVANCED',
  publicationSafety: 'PUBLIC_WITH_EXPLICIT_FIELDS',
  applicableVisibility: visible,
  conditions: ['REQUIRES_EXPLICIT_PUBLIC_FIELDS']
} as const;
const internal = {
  exposure: 'ADVANCED',
  publicationSafety: 'INTERNAL_ONLY',
  applicableVisibility: visible,
  conditions: ['REQUIRES_MEETING_DATA']
} as const;

const sacramentProgramRegistryDefinition = {
  DOCUMENT_TITLE: definition('DOCUMENT_TITLE', titleConfig, { text: 'Sacrament Meeting' }, { ...publicSafe, allowedDataModes: allModes }),
  WARD_NAME: definition('WARD_NAME', titleConfig, { text: 'Ward' }, { ...publicSafe, allowedDataModes: automaticModes }),
  MEETING_INFO: definition(
    'MEETING_INFO',
    meetingInfoConfig,
    { includeDate: true, includeTime: true, includeLocation: true },
    { ...publicSafe, allowedDataModes: automaticModes }
  ),
  MEETING_PROGRAM: definition(
    'MEETING_PROGRAM',
    meetingProgramConfig,
    { items: [], presentation: 'LABEL_VALUE' },
    { ...publicFields, allowedDataModes: allModes },
    2
  ),
  ANNOUNCEMENT_LIST: definition(
    'ANNOUNCEMENT_LIST',
    announcementListConfig,
    { items: [], presentation: 'COMPACT_ROWS' },
    { ...publicFields, allowedDataModes: ['MANUAL'] }
  ),
  SECTION_HEADING: definition(
    'SECTION_HEADING',
    sectionHeadingConfig,
    { title: 'Section', presentation: 'RULE' },
    { ...publicFields, allowedDataModes: ['MANUAL'] }
  ),
  SIMPLE_LIST: definition(
    'SIMPLE_LIST',
    simpleListConfig,
    { items: [], presentation: 'BULLETS' },
    { ...publicFields, allowedDataModes: ['MANUAL'] }
  ),
  PRESIDING_CONDUCTING: definition('PRESIDING_CONDUCTING', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  MUSIC_LEADERS: definition('MUSIC_LEADERS', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  SPEAKERS: definition('SPEAKERS', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  WARD_STAKE_BUSINESS: definition('WARD_STAKE_BUSINESS', textConfig, { text: '' }, { ...publicFields, allowedDataModes: allModes }),
  WARD_LEADERSHIP: definition('WARD_LEADERSHIP', textConfig, { text: '' }, { ...internal, allowedDataModes: automaticModes }),
  MISSIONARIES_SERVING: definition('MISSIONARIES_SERVING', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  MISSIONARIES_ASSIGNED: definition('MISSIONARIES_ASSIGNED', textConfig, { text: '' }, { ...internal, allowedDataModes: automaticModes }),
  WARD_CONTACT: definition('WARD_CONTACT', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  BUILDING_INFO: definition('BUILDING_INFO', textConfig, { text: '' }, { ...publicSafe, allowedDataModes: automaticModes }),
  SERVICE_TIMES: definition('SERVICE_TIMES', textConfig, { text: '' }, { ...publicSafe, allowedDataModes: automaticModes }),
  ANNOUNCEMENTS: definition('ANNOUNCEMENTS', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  UPCOMING_EVENTS: definition('UPCOMING_EVENTS', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  CALENDAR: definition('CALENDAR', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  THIS_WEEK: definition('THIS_WEEK', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  SUNDAY_LESSONS: definition('SUNDAY_LESSONS', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  YOUTH_ACTIVITIES: definition('YOUTH_ACTIVITIES', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  PRIMARY_ACTIVITIES: definition('PRIMARY_ACTIVITIES', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  TEMPLE_INFO: definition('TEMPLE_INFO', textConfig, { text: '' }, { ...publicFields, allowedDataModes: automaticModes }),
  SCRIPTURE: definition('SCRIPTURE', textConfig, { text: '' }, { ...publicFields, allowedDataModes: allModes }),
  QUOTE: definition('QUOTE', textConfig, { text: '' }, { ...publicFields, allowedDataModes: allModes }),
  CUSTOM_TEXT: definition('CUSTOM_TEXT', textConfig, { text: '' }, { ...publicFields, allowedDataModes: allModes }),
  IMAGE: definition('IMAGE', imageConfig, { assetId: null, alt: '', isDecorative: true }, { ...publicFields, allowedDataModes: allModes }),
  DIVIDER: definition('DIVIDER', dividerConfig, { style: 'SOLID' }, { ...publicSafe, allowedDataModes: allModes }),
  SPACER: definition('SPACER', spacerConfig, { height: 24 }, { ...publicSafe, allowedDataModes: allModes }),
  QR_CODE: definition(
    'QR_CODE',
    qrConfig,
    { href: 'https://example.com', label: 'Open link' },
    { ...publicFields, allowedDataModes: allModes }
  ),
  CUSTOM_LINK: definition(
    'CUSTOM_LINK',
    linkConfig,
    { label: 'Learn more', href: 'https://example.com' },
    { ...publicFields, allowedDataModes: allModes }
  )
} as const satisfies Record<SacramentProgramBlockType, BlockDefinition>;

type FrozenCatalog<T extends Record<string, BlockDefinition>> = {
  readonly [TKey in keyof T]: Omit<T[TKey], 'defaultConfig'> & { readonly defaultConfig: DeepReadonly<T[TKey]['defaultConfig']> };
};

function freezeCatalog<T extends Record<string, BlockDefinition>>(registry: T): FrozenCatalog<T> {
  const freezeValue = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const nestedValue of Object.values(value)) freezeValue(nestedValue);
    return Object.freeze(value);
  };
  const frozenEntries = Object.fromEntries(
    Object.entries(registry).map(([type, block]) => [
      type,
      Object.freeze({
        ...block,
        allowedDataModes: Object.freeze([...block.allowedDataModes]),
        applicableVisibility: Object.freeze([...block.applicableVisibility]),
        conditions: Object.freeze([...block.conditions]),
        supportedTargets: Object.freeze([...block.supportedTargets]),
        defaultConfig: freezeValue(block.defaultConfig)
      })
    ])
  );
  return Object.freeze(frozenEntries) as FrozenCatalog<T>;
}

export const sacramentProgramRegistry = freezeCatalog(sacramentProgramRegistryDefinition);

export const sacramentProgramLayoutSchema = createDocumentLayoutSchema(createDocumentBlockSchema(sacramentProgramRegistry));

export const sacramentProgramTypeDefinition: DocumentTypeDefinition<'SACRAMENT_PROGRAM', typeof sacramentProgramRegistry> = {
  type: 'SACRAMENT_PROGRAM',
  label: 'Sacrament Program',
  blocks: sacramentProgramRegistry
};

registerDocumentType(sacramentProgramTypeDefinition);
