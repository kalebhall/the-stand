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

import { BLOCK_TYPES } from './constants';

export const SACRAMENT_PROGRAM_BLOCK_TYPES = BLOCK_TYPES;

export type SacramentProgramBlockType = (typeof SACRAMENT_PROGRAM_BLOCK_TYPES)[number];
const textConfig = z.object({ text: structuredText(10_000) }).strict();
const titleConfig = z.object({ text: structuredText(500) }).strict();
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
  .object({ items: z.array(meetingItem).max(100) })
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
const imageConfig = z.object({ src: safeUrlSchema, alt: structuredText(500) }).strict();
const linkConfig = z.object({ label: boundedLabel, href: safeUrlSchema }).strict();
const qrConfig = z.object({ href: safeUrlSchema, label: boundedLabel }).strict();
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
  options: TOptions
): BlockDefinition<TType, z.output<TSchema>> & TOptions {
  return {
    type,
    schemaIdentity: `sacrament-program/${type}/v1`,
    schemaContract: `sacrament-program/${type}/config-v1`,
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
  MEETING_PROGRAM: definition('MEETING_PROGRAM', meetingProgramConfig, { items: [] }, { ...publicFields, allowedDataModes: allModes }),
  PRESIDING_CONDUCTING: definition('PRESIDING_CONDUCTING', textConfig, { text: '' }, { ...internal, allowedDataModes: automaticModes }),
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
  IMAGE: definition(
    'IMAGE',
    imageConfig,
    { src: 'https://example.com/image.png', alt: 'Program image' },
    { ...publicFields, allowedDataModes: allModes }
  ),
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
