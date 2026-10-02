import { pgTable, text, timestamp, uuid, integer, boolean, jsonb } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
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
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // manual delete only, no TTL enforcement
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  reportNumber: integer('report_number').default(1).notNull(),
  type: text('type').default('initial').notNull(),
  previewData: jsonb('preview_data').notNull(),
  fullReportData: jsonb('full_report_data'),
  isUnlocked: boolean('is_unlocked').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  reportId: uuid('report_id').references(() => reports.id, { onDelete: 'cascade' }),
  stripeSessionId: text('stripe_session_id').unique().notNull(),
  amount: integer('amount').notNull(), // 999 for $9.99
  status: text('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const otpCodes = pgTable('otp_codes', {
  email: text('email').primaryKey(),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  sendCount: integer('send_count').default(0).notNull(),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(), // SHA256 hash of random 32B hex token
  profileId: uuid('profile_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventName: text('event_name').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
