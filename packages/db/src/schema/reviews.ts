import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { contracts } from './contracts';
import { users } from './users';

export type RatingBreakdown = {
  communication: number;
  quality: number;
  deadline: number;
  professionalism: number;
};

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revieweeId: uuid('reviewee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment').notNull(),
    ratingBreakdown: jsonb('rating_breakdown').$type<RatingBreakdown>(),
    isPublic: boolean('is_public').notNull().default(true),
    sbtTokenId: text('sbt_token_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Compound unique on (contractId, reviewerId) — both parties on a contract
  // can each leave one review of the other, but neither can review twice.
  // This is the "two-sided reputation" model that powers the chain of trust.
  (table) => [
    uniqueIndex('reviews_contract_reviewer_unique').on(table.contractId, table.reviewerId),
    index('reviews_reviewee_idx').on(table.revieweeId),
    index('reviews_reviewer_idx').on(table.reviewerId),
    index('reviews_contract_idx').on(table.contractId),
  ],
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  contract: one(contracts, {
    fields: [reviews.contractId],
    references: [contracts.id],
  }),
  reviewer: one(users, {
    fields: [reviews.reviewerId],
    references: [users.id],
  }),
  reviewee: one(users, {
    fields: [reviews.revieweeId],
    references: [users.id],
  }),
}));

export const insertReviewSchema = createInsertSchema(reviews);
export const selectReviewSchema = createSelectSchema(reviews);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
