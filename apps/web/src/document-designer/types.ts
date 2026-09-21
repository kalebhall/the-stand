import type {
  BLOCK_TYPES,
  BLOCK_WIDTHS,
  DATA_MODES,
  DIGITAL_BEHAVIORS,
  DOCUMENT_TYPES,
  FOLD_TYPES,
  LOCK_LEVELS,
  LOCK_PROPERTIES,
  ORIENTATIONS,
  PAPER_SIZES,
  PRINT_BEHAVIORS,
  TEMPLATE_SCOPES,
  TEMPLATE_STATUSES,
  THEME_FONT_FAMILIES,
  VISIBILITY_MODES
} from './constants';

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type PaperSize = (typeof PAPER_SIZES)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type FoldType = (typeof FOLD_TYPES)[number];
export type BlockWidth = (typeof BLOCK_WIDTHS)[number];
export type DataMode = (typeof DATA_MODES)[number];
export type TemplateScope = (typeof TEMPLATE_SCOPES)[number];
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
export type LockLevel = (typeof LOCK_LEVELS)[number];
export type LockProperty = (typeof LOCK_PROPERTIES)[number];
export type VisibilityMode = (typeof VISIBILITY_MODES)[number];
export type PrintBehavior = (typeof PRINT_BEHAVIORS)[number];
export type DigitalBehavior = (typeof DIGITAL_BEHAVIORS)[number];
export type ThemeFontFamily = (typeof THEME_FONT_FAMILIES)[number];
export type BlockType = (typeof BLOCK_TYPES)[number];
export type DocumentId = string & { readonly __brand: 'DocumentId' };
export type DocumentMetadata = object;

export interface DocumentTheme {
  fontFamily: ThemeFontFamily;
  baseFontSize: number;
  accentColor: string;
}

export interface DocumentLock {
  level: LockLevel;
  properties: readonly LockProperty[];
}

export interface DocumentBlockBase<TType extends string = BlockType> {
  id: DocumentId;
  type: TType;
  width: BlockWidth;
  dataMode: DataMode;
  visibility: VisibilityMode;
  printBehavior: PrintBehavior;
  digitalBehavior: DigitalBehavior;
  lock?: DocumentLock;
}

export interface DocumentTitleBlock extends DocumentBlockBase<'DOCUMENT_TITLE'> {
  config: { text: string };
}
export interface WardNameBlock extends DocumentBlockBase<'WARD_NAME'> {
  config: { text: string };
}
export interface MeetingInfoBlock extends DocumentBlockBase<'MEETING_INFO'> {
  config: { includeDate: boolean; includeTime: boolean; includeLocation: boolean };
}
export interface MeetingProgramItem {
  order: number;
  kind: 'OPENING' | 'HYMN' | 'PRAYER' | 'SPEAKER' | 'ORDINANCE' | 'CLOSING' | 'OTHER';
  label: string;
  details?: string;
}
export interface MeetingProgramBlock extends DocumentBlockBase<'MEETING_PROGRAM'> {
  config: { items: MeetingProgramItem[] };
}
export interface TextBlock<TType extends BlockType> extends DocumentBlockBase<TType> {
  config: { text: string };
}
export type PresidingConductingBlock = TextBlock<'PRESIDING_CONDUCTING'>;
export type MusicLeadersBlock = TextBlock<'MUSIC_LEADERS'>;
export type SpeakersBlock = TextBlock<'SPEAKERS'>;
export type WardStakeBusinessBlock = TextBlock<'WARD_STAKE_BUSINESS'>;
export type WardLeadershipBlock = TextBlock<'WARD_LEADERSHIP'>;
export type MissionariesServingBlock = TextBlock<'MISSIONARIES_SERVING'>;
export type MissionariesAssignedBlock = TextBlock<'MISSIONARIES_ASSIGNED'>;
export type WardContactBlock = TextBlock<'WARD_CONTACT'>;
export type BuildingInfoBlock = TextBlock<'BUILDING_INFO'>;
export type ServiceTimesBlock = TextBlock<'SERVICE_TIMES'>;
export type AnnouncementsBlock = TextBlock<'ANNOUNCEMENTS'>;
export type UpcomingEventsBlock = TextBlock<'UPCOMING_EVENTS'>;
export type CalendarBlock = TextBlock<'CALENDAR'>;
export type ThisWeekBlock = TextBlock<'THIS_WEEK'>;
export type SundayLessonsBlock = TextBlock<'SUNDAY_LESSONS'>;
export type YouthActivitiesBlock = TextBlock<'YOUTH_ACTIVITIES'>;
export type PrimaryActivitiesBlock = TextBlock<'PRIMARY_ACTIVITIES'>;
export type TempleInfoBlock = TextBlock<'TEMPLE_INFO'>;
export type ScriptureBlock = TextBlock<'SCRIPTURE'>;
export type QuoteBlock = TextBlock<'QUOTE'>;
export type CustomTextBlock = TextBlock<'CUSTOM_TEXT'>;
export interface DividerBlock extends DocumentBlockBase<'DIVIDER'> {
  config: { style: 'SOLID' | 'DOTTED' };
}
export interface SpacerBlock extends DocumentBlockBase<'SPACER'> {
  config: { height: number };
}
export interface ImageBlock extends DocumentBlockBase<'IMAGE'> {
  config: { assetId: string | null; alt: string; isDecorative: boolean };
}
export interface QrCodeBlock extends DocumentBlockBase<'QR_CODE'> {
  config: { href: string; label: string };
}
export interface CustomLinkBlock extends DocumentBlockBase<'CUSTOM_LINK'> {
  config: { label: string; href: string };
}

export interface SacramentProgramBlockMap {
  DOCUMENT_TITLE: DocumentTitleBlock;
  WARD_NAME: WardNameBlock;
  MEETING_INFO: MeetingInfoBlock;
  MEETING_PROGRAM: MeetingProgramBlock;
  PRESIDING_CONDUCTING: PresidingConductingBlock;
  MUSIC_LEADERS: MusicLeadersBlock;
  SPEAKERS: SpeakersBlock;
  WARD_STAKE_BUSINESS: WardStakeBusinessBlock;
  WARD_LEADERSHIP: WardLeadershipBlock;
  MISSIONARIES_SERVING: MissionariesServingBlock;
  MISSIONARIES_ASSIGNED: MissionariesAssignedBlock;
  WARD_CONTACT: WardContactBlock;
  BUILDING_INFO: BuildingInfoBlock;
  SERVICE_TIMES: ServiceTimesBlock;
  ANNOUNCEMENTS: AnnouncementsBlock;
  UPCOMING_EVENTS: UpcomingEventsBlock;
  CALENDAR: CalendarBlock;
  THIS_WEEK: ThisWeekBlock;
  SUNDAY_LESSONS: SundayLessonsBlock;
  YOUTH_ACTIVITIES: YouthActivitiesBlock;
  PRIMARY_ACTIVITIES: PrimaryActivitiesBlock;
  TEMPLE_INFO: TempleInfoBlock;
  SCRIPTURE: ScriptureBlock;
  QUOTE: QuoteBlock;
  CUSTOM_TEXT: CustomTextBlock;
  IMAGE: ImageBlock;
  DIVIDER: DividerBlock;
  SPACER: SpacerBlock;
  QR_CODE: QrCodeBlock;
  CUSTOM_LINK: CustomLinkBlock;
}

export type DocumentBlock = SacramentProgramBlockMap[BlockType];

export type DocumentBlockRegistry = Record<string, DocumentBlockBase<string> & { config: unknown }>;

export type RegistryDocumentBlock<TRegistry extends DocumentBlockRegistry> = {
  [TType in keyof TRegistry]: TType extends string
    ? TRegistry[TType] extends DocumentBlockBase<TType> & { config: unknown }
      ? TRegistry[TType]
      : never
    : never;
}[keyof TRegistry];

export interface TemplateMetadata {
  name: string;
  description?: string;
  scope: TemplateScope;
  status: TemplateStatus;
}

export interface DocumentTemplate<
  TMetadata extends DocumentMetadata = TemplateMetadata,
  TBlock extends DocumentBlockBase<string> = DocumentBlock
> extends DocumentLayout<TMetadata, TBlock> {
  metadata: TMetadata;
}

export interface DocumentRegion<TBlock extends DocumentBlockBase<string> = DocumentBlock> {
  id: DocumentId;
  ratio: number;
  gutter: number;
  blocks: TBlock[];
  lock?: DocumentLock;
}

export interface DocumentPage<TBlock extends DocumentBlockBase<string> = DocumentBlock> {
  id: DocumentId;
  regions: DocumentRegion<TBlock>[];
  lock?: DocumentLock;
}

export interface DocumentLayout<
  TMetadata extends DocumentMetadata = DocumentMetadata,
  TBlock extends DocumentBlockBase<string> = DocumentBlock
> {
  id: DocumentId;
  schemaVersion: 1;
  documentType: 'SACRAMENT_PROGRAM';
  paper: PaperSize;
  orientation: Orientation;
  fold: FoldType;
  theme: DocumentTheme;
  metadata?: TMetadata;
  pages: DocumentPage<TBlock>[];
  lock?: DocumentLock;
}
