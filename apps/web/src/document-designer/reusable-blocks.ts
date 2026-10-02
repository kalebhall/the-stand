import { BLOCK_WIDTHS, DIGITAL_BEHAVIORS, PRINT_BEHAVIORS, VISIBILITY_MODES } from './constants';
import { idSchema } from './primitives';
import { sacramentProgramRegistry } from './sacrament-program';
import type { BlockType, DigitalBehavior, DocumentBlock, DocumentId, PrintBehavior, VisibilityMode, BlockWidth } from './types';

export const REUSABLE_BLOCK_SCOPES = ['PERSONAL', 'WARD', 'STAKE'] as const;
export type ReusableBlockScope = (typeof REUSABLE_BLOCK_SCOPES)[number];

export type ReusableBlockOwnership =
  | { scope: 'PERSONAL'; wardId: string; stakeId: string; ownerUserId: string }
  | { scope: 'WARD'; wardId: string; stakeId: string; ownerUserId: string | null }
  | { scope: 'STAKE'; wardId: null; stakeId: string; ownerUserId: string | null };

export const REUSABLE_BLOCK_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ReusableBlockStatus = (typeof REUSABLE_BLOCK_STATUSES)[number];

export const REUSABLE_BLOCK_CATEGORIES = ['CONTENT', 'MEDIA', 'LINKS'] as const;
export type ReusableBlockCategory = (typeof REUSABLE_BLOCK_CATEGORIES)[number];

export const REUSABLE_BLOCK_TYPES = ['CUSTOM_TEXT', 'IMAGE', 'DIVIDER', 'SPACER', 'QR_CODE', 'CUSTOM_LINK'] as const;
export type ReusableBlockType = (typeof REUSABLE_BLOCK_TYPES)[number];

export type ReusableBlockConfig<TType extends ReusableBlockType = ReusableBlockType> = Extract<DocumentBlock, { type: TType }>['config'];

export type ReusableBlockPresentation = {
  width: BlockWidth;
  visibility: VisibilityMode;
  printBehavior: PrintBehavior;
  digitalBehavior: DigitalBehavior;
};

export type ReusableBlockSnapshot<TType extends ReusableBlockType = ReusableBlockType> = ReusableBlockPresentation & {
  version: number;
  blockType: TType;
  config: ReusableBlockConfig<TType>;
};

export type ReusableBlockCatalogEntry<TType extends ReusableBlockType = ReusableBlockType> = {
  type: TType;
  category: ReusableBlockCategory;
  sourceDriven: boolean;
};

export const REUSABLE_BLOCK_CATALOG = [
  { type: 'CUSTOM_TEXT', category: 'CONTENT', sourceDriven: false },
  { type: 'IMAGE', category: 'MEDIA', sourceDriven: false },
  { type: 'DIVIDER', category: 'CONTENT', sourceDriven: false },
  { type: 'SPACER', category: 'CONTENT', sourceDriven: false },
  { type: 'QR_CODE', category: 'LINKS', sourceDriven: false },
  { type: 'CUSTOM_LINK', category: 'LINKS', sourceDriven: false }
] as const satisfies readonly ReusableBlockCatalogEntry[];

export type ReusableBlockRecord<TType extends ReusableBlockType = ReusableBlockType> = {
  id: string;
  name: string;
  description: string | null;
  status: ReusableBlockStatus;
  createdByUserId: string | null;
  sourceVersion: number | null;
  ownership: ReusableBlockOwnership;
  snapshot: ReusableBlockSnapshot<TType>;
};

export type InsertedReusableBlock<TType extends ReusableBlockType = ReusableBlockType> = {
  reusableBlockId: string;
  sourceBlockId: DocumentId;
  snapshot: ReusableBlockSnapshot<TType>;
};

export function assertReusableBlockVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) throw new Error('Reusable block version must be a positive integer');
}

export function assertReusableBlockOwnership(ownership: ReusableBlockOwnership): void {
  if (!ownership || typeof ownership !== 'object') throw new Error('Reusable block ownership is required');
  if (!REUSABLE_BLOCK_SCOPES.includes(ownership.scope)) throw new Error('Unsupported reusable block scope');
  if (!idSchema.safeParse(ownership.stakeId).success) throw new Error('Reusable blocks require a valid stake ID');
  if (ownership.wardId !== null && !idSchema.safeParse(ownership.wardId).success) throw new Error('Reusable block requires a valid ward ID');
  if (ownership.ownerUserId !== null && !idSchema.safeParse(ownership.ownerUserId).success) throw new Error('Reusable block owner must be a valid user ID or null');
  if (ownership.scope === 'STAKE' && ownership.wardId !== null) throw new Error('Stake reusable blocks cannot be ward-scoped');
  if (ownership.scope === 'STAKE' && ownership.ownerUserId !== null) throw new Error('Stake reusable blocks cannot have a personal owner');
  if (ownership.scope !== 'STAKE' && !ownership.wardId) throw new Error('Ward and personal reusable blocks require a ward');
  if (ownership.scope === 'PERSONAL' && !ownership.ownerUserId) throw new Error('Personal reusable blocks require an owner');
}

export function assertReusableBlockSnapshot(snapshot: ReusableBlockSnapshot): void {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('Reusable block snapshot must be an object');
  assertReusableBlockVersion(snapshot.version);
  if (!isReusableBlockType(snapshot.blockType)) throw new Error('Unsupported reusable block type');
  if (!BLOCK_WIDTHS.includes(snapshot.width) || !VISIBILITY_MODES.includes(snapshot.visibility)) throw new Error('Invalid reusable block presentation');
  if (!PRINT_BEHAVIORS.includes(snapshot.printBehavior) || !DIGITAL_BEHAVIORS.includes(snapshot.digitalBehavior)) {
    throw new Error('Invalid reusable block output behavior');
  }
  if (snapshot.printBehavior === 'PRINT_ONLY' && snapshot.digitalBehavior === 'LINK') throw new Error('PRINT_ONLY blocks cannot use digital links');
  if (!sacramentProgramRegistry[snapshot.blockType].configSchema.safeParse(snapshot.config).success) throw new Error('Invalid reusable block configuration');
}

export function isReusableBlockType(type: BlockType): type is ReusableBlockType {
  return (REUSABLE_BLOCK_TYPES as readonly string[]).includes(type);
}

export function getReusableBlockCatalogEntry(type: BlockType): ReusableBlockCatalogEntry | null {
  return REUSABLE_BLOCK_CATALOG.find((entry) => entry.type === type) ?? null;
}
