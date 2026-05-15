import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { badgeTierEnum, userRoleEnum } from './enums';
import { jobs } from './jobs';
import { proposals } from './proposals';
import { contracts } from './contracts';
import { reviews } from './reviews';
import { messages } from './messages';
import { notifications } from './notifications';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    privyId: text('privy_id').notNull().unique(),
    walletAddress: text('wallet_address').unique(),
    email: text('email'),
    username: text('username').unique(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    role: userRoleEnum('role').notNull().default('client'),
    skills: text('skills').array().notNull().default(sql`'{}'::text[]`),
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }),
    country: text('country'),
    timezone: text('timezone'),
    portfolioIpfsHash: text('portfolio_ipfs_hash'),
    workScore: numeric('work_score', { precision: 10, scale: 2 }).notNull().default('0'),
    badgeTier: badgeTierEnum('badge_tier').notNull().default('none'),
    totalJobsCompleted: integer('total_jobs_completed').notNull().default(0),
    totalEarned: numeric('total_earned', { precision: 14, scale: 2 }).notNull().default('0'),
    isVerified: boolean('is_verified').notNull().default(false),
    isOnboarded: boolean('is_onboarded').notNull().default(false),
    /**
     * Per-channel notification opt-outs. Shape:
     *   { inApp: { proposal_received: false, ... }, email: { ... } }
     * A missing key means "use the default" (in-app + email both ON).
     * Stored as JSONB so we can add new notification types without a
     * schema migration.
     */
    notificationPreferences: jsonb('notification_preferences').$type<{
      inApp?: Partial<Record<string, boolean>>;
      email?: Partial<Record<string, boolean>>;
    }>(),
    /**
     * Soft-delete tombstone. Set when the user requests account deletion.
     * The row stays in the DB so on-chain history (contracts, reviews,
     * proof receipts) keeps referring to a valid record — but PII fields
     * are anonymised and Privy sessions are invalidated. Queries that
     * surface "real" users filter out non-null `deletedAt`.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('users_privy_id_idx').on(table.privyId),
    uniqueIndex('users_username_idx').on(table.username),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  jobsPosted: many(jobs),
  proposals: many(proposals),
  clientContracts: many(contracts, { relationName: 'clientContracts' }),
  freelancerContracts: many(contracts, { relationName: 'freelancerContracts' }),
  reviewsGiven: many(reviews, { relationName: 'reviewsGiven' }),
  reviewsReceived: many(reviews, { relationName: 'reviewsReceived' }),
  sentMessages: many(messages, { relationName: 'sentMessages' }),
  receivedMessages: many(messages, { relationName: 'receivedMessages' }),
  notifications: many(notifications, { relationName: 'notifications' }),
  triggeredNotifications: many(notifications, { relationName: 'triggeredNotifications' }),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
