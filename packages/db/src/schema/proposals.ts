import { relations, sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { budgetTypeEnum, proposalStatusEnum } from './enums';
import { jobs } from './jobs';
import { users } from './users';

export type ProposalMilestone = {
  title: string;
  amount: number;
  duration: string;
  description: string;
};

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    coverLetter: text('cover_letter').notNull(),
    bidAmount: numeric('bid_amount', { precision: 12, scale: 2 }).notNull(),
    bidType: budgetTypeEnum('bid_type').notNull(),
    estimatedDuration: text('estimated_duration').notNull(),
    milestones: jsonb('milestones').$type<ProposalMilestone[]>(),
    status: proposalStatusEnum('status').notNull().default('pending'),
    attachments: text('attachments').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('proposals_job_freelancer_unique').on(table.jobId, table.freelancerId),
    index('proposals_freelancer_id_idx').on(table.freelancerId),
    index('proposals_status_idx').on(table.status),
  ],
);

export const proposalsRelations = relations(proposals, ({ one }) => ({
  job: one(jobs, {
    fields: [proposals.jobId],
    references: [jobs.id],
  }),
  freelancer: one(users, {
    fields: [proposals.freelancerId],
    references: [users.id],
  }),
}));

export const insertProposalSchema = createInsertSchema(proposals);
export const selectProposalSchema = createSelectSchema(proposals);

export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;
