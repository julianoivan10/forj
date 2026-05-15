import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  budgetTypeEnum,
  currencyEnum,
  experienceLevelEnum,
  jobCategoryEnum,
  jobDurationEnum,
  jobStatusEnum,
  visibilityEnum,
} from './enums';
import { users } from './users';

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull(),
    category: jobCategoryEnum('category').notNull(),
    subcategory: text('subcategory'),
    skills: text('skills').array().notNull().default(sql`'{}'::text[]`),
    /** Optional cover image surfaced on listing cards. UploadThing URL. */
    coverImageUrl: text('cover_image_url'),
    budgetType: budgetTypeEnum('budget_type').notNull(),
    budgetMin: numeric('budget_min', { precision: 12, scale: 2 }).notNull(),
    budgetMax: numeric('budget_max', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull().default('USDC'),
    duration: jobDurationEnum('duration').notNull(),
    experienceLevel: experienceLevelEnum('experience_level').notNull(),
    status: jobStatusEnum('status').notNull().default('draft'),
    visibility: visibilityEnum('visibility').notNull().default('public'),
    attachments: text('attachments').array().notNull().default(sql`'{}'::text[]`),
    proposalCount: integer('proposal_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    isFeatured: boolean('is_featured').notNull().default(false),
    featuredUntil: timestamp('featured_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('jobs_slug_idx').on(table.slug),
    index('jobs_client_id_idx').on(table.clientId),
    index('jobs_status_idx').on(table.status),
    index('jobs_category_idx').on(table.category),
    index('jobs_created_at_idx').on(table.createdAt),
  ],
);

export const jobsRelations = relations(jobs, ({ one }) => ({
  client: one(users, {
    fields: [jobs.clientId],
    references: [users.id],
  }),
}));

export const insertJobSchema = createInsertSchema(jobs);
export const selectJobSchema = createSelectSchema(jobs);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
