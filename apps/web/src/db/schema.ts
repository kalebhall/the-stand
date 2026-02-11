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
  memberName: text('member_name').notNull(),
  callingName: text('calling_name').notNull(),
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
