import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  googleSub: text('google_sub').unique(),
  locale: text('locale').default('en').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category').notNull(), // 'romantic' | 'friends_group' | 'family' | etc.
  source: text('source').notNull(),     // 'whatsapp' | 'imessage'
  participants: text('participants').array().notNull().default([]),
  messageCount: integer('message_count').default(0),
  fileUrl: text('file_url'),
  deleteToken: text('delete_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('conversations_owner_idx').on(table.userId),
  index('conversations_owner_created_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
]);

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  reportNumber: integer('report_number').default(1).notNull(),
  type: text('type').default('initial').notNull(),
  previewData: jsonb('preview_data').notNull(),
  fullReportData: jsonb('full_report_data'),
  isUnlocked: boolean('is_unlocked').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('reports_conversation_number_idx').on(table.conversationId, table.reportNumber)]);

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  reportId: uuid('report_id').references(() => reports.id, { onDelete: 'cascade' }),
  stripeSessionId: text('stripe_session_id').unique().notNull(),
  amount: integer('amount').notNull(), // 999 for $9.99
  status: text('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('purchases_owner_idx').on(table.userId), index('purchases_report_idx').on(table.reportId)]);

export const otpCodes = pgTable('otp_codes', {
  email: text('email').primaryKey(),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  sendCount: integer('send_count').default(0).notNull(),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('otp_codes_expiry_idx').on(table.expiresAt)]);

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(), // SHA256 hash of random 32B hex token
  profileId: uuid('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  // Sessions from the former unverified sign-in flow remain invalid after upgrade.
  authVersion: integer('auth_version').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('sessions_profile_idx').on(table.profileId), index('sessions_expiry_idx').on(table.expiresAt)]);

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventName: text('event_name').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Durable generation: payloads are cleared after completion or terminal failure.
export const analysisJobs = pgTable('analysis_jobs', {
  id: uuid('id').primaryKey(),
  conversationId: uuid('conversation_id').notNull(),
  status: text('status').notNull().default('queued'),
  stage: text('stage').notNull().default('Queued'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  attempts: integer('attempts').notNull().default(0),
  leaseId: uuid('lease_id'),
  leaseUntil: timestamp('lease_until', {withTimezone:true}),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', {withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone:true}).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: 'analysis_jobs_conversation_id_fkey', columns: [table.conversationId], foreignColumns: [conversations.id] }).onDelete('cascade'),
  index('analysis_jobs_queue_idx').on(table.status, table.leaseUntil),
  index('analysis_jobs_created_idx').on(table.createdAt),
  index('analysis_jobs_conversation_idx').on(table.conversationId),
]);
export const reportShares = pgTable('report_shares', {
  conversationId: uuid('conversation_id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique('report_shares_token_hash_key'),
  expiresAt: timestamp('expires_at', {withTimezone:true}).notNull(),
}, (table) => [
  foreignKey({ name: 'report_shares_conversation_id_fkey', columns: [table.conversationId], foreignColumns: [conversations.id] }).onDelete('cascade'),
  index('report_shares_expiry_idx').on(table.expiresAt),
]);
export const requestLimits = pgTable('request_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: timestamp('expires_at', {withTimezone:true}).notNull(),
}, (table) => [index('request_limits_expiry_idx').on(table.expiresAt)]);
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  email: text('email'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', {withTimezone:true}).notNull().defaultNow(),
}, (table) => [index('feedback_email_idx').on(table.email)]);

export const followups = pgTable('followups', {
  id: uuid('id').primaryKey(),
  conversationId: uuid('conversation_id').notNull(),
  reportNumber: integer('report_number').notNull().default(1),
  question: text('question').notNull(),
  answer: text('answer'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: 'followups_conversation_id_fkey', columns: [table.conversationId], foreignColumns: [conversations.id] }).onDelete('cascade'),
  index('followups_history_idx').on(table.conversationId, table.reportNumber, table.createdAt.desc()),
  index('followups_pending_idx').on(table.status, table.updatedAt),
  index('followups_created_idx').on(table.createdAt),
]);
