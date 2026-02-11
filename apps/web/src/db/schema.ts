import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core';

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
