import { boolean, date, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const stake = pgTable('stake', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const ward = pgTable('ward', {
  id: uuid('id').defaultRandom().primaryKey(),
  stakeId: uuid('stake_id').notNull().references(() => stake.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  unitNumber: text('unit_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const userAccount = pgTable('user_account', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  lastPasswordChangeAt: timestamp('last_password_change_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const role = pgTable('role', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  scope: text('scope').notNull()
});


export const userGlobalRole = pgTable(
  'user_global_role',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => userAccount.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => role.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userGlobalRoleUnique: unique().on(table.userId, table.roleId)
  })
);

export const wardUserRole = pgTable(
  'ward_user_role',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => userAccount.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => role.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    wardUserRoleUnique: unique().on(table.wardId, table.userId, table.roleId)
  })
);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id'),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const accessRequest = pgTable('access_request', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  stake: text('stake').notNull(),
  ward: text('ward').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const meeting = pgTable('meeting', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
  meetingDate: date('meeting_date').notNull(),
  meetingType: text('meeting_type').notNull(),
  status: text('status').notNull().default('DRAFT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const meetingProgramItem = pgTable('meeting_program_item', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
  meetingId: uuid('meeting_id').notNull().references(() => meeting.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  itemType: text('item_type').notNull(),
  title: text('title'),
  notes: text('notes'),
  hymnNumber: text('hymn_number'),
  hymnTitle: text('hymn_title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const meetingProgramRender = pgTable(
  'meeting_program_render',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id').notNull().references(() => meeting.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    renderHtml: text('render_html').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    meetingProgramRenderVersionUnique: unique().on(table.meetingId, table.version)
  })
);


export const wardStandTemplate = pgTable(
  'ward_stand_template',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    welcomeText: text('welcome_text').notNull().default('Welcome to The Church of Jesus Christ of Latter-day Saints.'),
    sustainTemplate: text('sustain_template')
      .notNull()
      .default('Those in favor of sustaining **{memberName}** as **{callingName}**, please manifest it.'),
    releaseTemplate: text('release_template')
      .notNull()
      .default('Those who wish to express appreciation for the service of **{memberName}** as **{callingName}**, please do so.'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    wardStandTemplateWardUnique: unique().on(table.wardId)
  })
);

export const callingAssignment = pgTable('calling_assignment', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').references(() => member.id, { onDelete: 'set null' }),
  memberName: text('member_name').notNull(),
  birthday: text('birthday'),
  organization: text('organization'),
  callingName: text('calling_name').notNull(),
  sustained: boolean('sustained').notNull().default(false),
  setApart: boolean('set_apart').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const callingAction = pgTable('calling_action', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
  callingAssignmentId: uuid('calling_assignment_id')
    .notNull()
    .references(() => callingAssignment.id, { onDelete: 'cascade' }),
  actionStatus: text('action_status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const meetingBusinessLine = pgTable('meeting_business_line', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
  meetingId: uuid('meeting_id').notNull().references(() => meeting.id, { onDelete: 'cascade' }),
  memberName: text('member_name').notNull(),
  callingName: text('calling_name').notNull(),
  actionType: text('action_type').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});


export const announcement = pgTable('announcement', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isPermanent: boolean('is_permanent').notNull().default(false),
  placement: text('placement').notNull().default('PROGRAM_TOP'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});


export const calendarFeed = pgTable(
  'calendar_feed',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    feedScope: text('feed_scope').notNull(),
    feedUrl: text('feed_url').notNull(),
    tagMap: jsonb('tag_map'),
    isActive: boolean('is_active').notNull().default(true),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    lastRefreshStatus: text('last_refresh_status'),
    lastRefreshError: text('last_refresh_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    calendarFeedWardUrlUnique: unique().on(table.wardId, table.feedUrl)
  })
);

export const calendarEventCache = pgTable(
  'calendar_event_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    calendarFeedId: uuid('calendar_feed_id').notNull().references(() => calendarFeed.id, { onDelete: 'cascade' }),
    externalUid: text('external_uid').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    allDay: boolean('all_day').notNull().default(false),
    tags: text('tags').array().notNull().default([]),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    copiedToAnnouncementAt: timestamp('copied_to_announcement_at', { withTimezone: true }),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    calendarEventCacheFeedUidUnique: unique().on(table.wardId, table.calendarFeedId, table.externalUid, table.startsAt)
  })
);

export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    eventOutboxDedupeUnique: unique().on(table.wardId, table.eventType, table.aggregateId)
  })
);

export const notificationDelivery = pgTable(
  'notification_delivery',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    eventOutboxId: uuid('event_outbox_id')
      .notNull()
      .references(() => eventOutbox.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    deliveryStatus: text('delivery_status').notNull().default('pending'),
    externalId: text('external_id'),
    errorMessage: text('error_message'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    notificationDeliveryEventChannelUnique: unique().on(table.eventOutboxId, table.channel)
  })
);

export const publicProgramShare = pgTable(
  'public_program_share',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id').notNull().references(() => meeting.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    publicProgramShareTokenUnique: unique().on(table.token),
    publicProgramShareMeetingUnique: unique().on(table.meetingId)
  })
);

export const publicProgramPortal = pgTable(
  'public_program_portal',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    publicProgramPortalTokenUnique: unique().on(table.token),
    publicProgramPortalWardUnique: unique().on(table.wardId)
  })
);

export const member = pgTable(
  'member',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    age: integer('age'),
    birthday: text('birthday'),
    gender: text('gender'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    memberWardNameUnique: unique().on(table.wardId, table.fullName)
  })
);

export const memberNote = pgTable('member_note', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => member.id, { onDelete: 'cascade' }),
  noteText: text('note_text').notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => userAccount.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const importRun = pgTable('import_run', {
  id: uuid('id').defaultRandom().primaryKey(),
  wardId: uuid('ward_id').notNull().references(() => ward.id, { onDelete: 'cascade' }),
  importType: text('import_type').notNull(),
  rawText: text('raw_text').notNull(),
  parsedCount: integer('parsed_count').notNull().default(0),
  committed: boolean('committed').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => userAccount.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
