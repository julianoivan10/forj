import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  index,
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
import {
  contractStatusEnum,
  currencyEnum,
  escrowOnchainStatusEnum,
  escrowVersionEnum,
  paymentMethodEnum,
} from './enums';
import { escrowTransactions } from './escrow-sync';
import { jobs } from './jobs';
import { proposals } from './proposals';
import { users } from './users';

export type ContractMilestone = {
  title: string;
  amount: number;
  duration: string;
  description: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'approved';
};

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    platformFee: numeric('platform_fee', { precision: 14, scale: 2 }).notNull(),
    freelancerAmount: numeric('freelancer_amount', { precision: 14, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull().default('USDC'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    status: contractStatusEnum('status').notNull().default('created'),
    escrowTxHash: text('escrow_tx_hash'),
    releaseTxHash: text('release_tx_hash'),
    escrowContractAddress: text('escrow_contract_address'),
    onChainContractId: integer('on_chain_contract_id'),
    milestones: jsonb('milestones').$type<ContractMilestone[]>(),
    currentMilestone: integer('current_milestone').notNull().default(0),
    deliveryDeadline: timestamp('delivery_deadline', { withTimezone: true }).notNull(),
    autoReleaseAt: timestamp('auto_release_at', { withTimezone: true }),
    disputeReason: text('dispute_reason'),
    // Submission / revision tracking (Phase 3A — off-chain lifecycle)
    submissionMessage: text('submission_message'),
    submissionFiles: text('submission_files').array(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    revisionReason: text('revision_reason'),
    revisionCount: integer('revision_count').notNull().default(0),
    cancellationReason: text('cancellation_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    fundedAt: timestamp('funded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // ── On-chain escrow sync (v3) ─────────────────────────────────────
    // `status` above is the application view. The fields below are the
    // chain view: written only by the event processor / reconciler from
    // confirmed logs or direct `getEscrow` reads, never from user intent.
    escrowVersion: escrowVersionEnum('escrow_version').notNull().default('v2'),
    chainId: integer('chain_id'),
    /** bytes32 hex passed to `fund()`; ties this row to exactly one escrow. */
    contractRef: text('contract_ref'),
    onChainStatus: escrowOnchainStatusEnum('on_chain_status').notNull().default('none'),
    onChainRevisionCount: integer('on_chain_revision_count').notNull().default(0),
    onChainMaxRevisions: integer('on_chain_max_revisions'),
    workDeadlineAt: timestamp('work_deadline_at', { withTimezone: true }),
    reviewDeadlineAt: timestamp('review_deadline_at', { withTimezone: true }),
    disputeDeadlineAt: timestamp('dispute_deadline_at', { withTimezone: true }),
    /** Base units actually paid at settlement, from the settlement event. */
    settledToFreelancer: numeric('settled_to_freelancer', { precision: 38, scale: 0 }),
    settledToClient: numeric('settled_to_client', { precision: 38, scale: 0 }),
    settledToFee: numeric('settled_to_fee', { precision: 38, scale: 0 }),
    /** (block, logIndex) of the newest applied event; guards out-of-order replays. */
    lastEventBlock: bigint('last_event_block', { mode: 'bigint' }),
    lastEventLogIndex: integer('last_event_log_index'),
    lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
    /** Human-readable DB vs chain mismatch found by the reconciler; null when in sync. */
    syncIssue: text('sync_issue'),
  },
  (table) => [
    index('contracts_client_id_idx').on(table.clientId),
    index('contracts_freelancer_id_idx').on(table.freelancerId),
    index('contracts_status_idx').on(table.status),
    index('contracts_on_chain_id_idx').on(table.onChainContractId),
    uniqueIndex('contracts_contract_ref_unique').on(table.contractRef),
    // One on-chain escrow backs at most one contract row (replay guard at DB level).
    uniqueIndex('contracts_escrow_onchain_unique')
      .on(table.escrowContractAddress, table.onChainContractId)
      .where(sql`${table.onChainContractId} is not null`),
    index('contracts_onchain_open_idx').on(table.escrowVersion, table.onChainStatus),
  ],
);

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  escrowTransactions: many(escrowTransactions),
  job: one(jobs, {
    fields: [contracts.jobId],
    references: [jobs.id],
  }),
  client: one(users, {
    fields: [contracts.clientId],
    references: [users.id],
  }),
  freelancer: one(users, {
    fields: [contracts.freelancerId],
    references: [users.id],
  }),
  proposal: one(proposals, {
    fields: [contracts.proposalId],
    references: [proposals.id],
  }),
}));

export const insertContractSchema = createInsertSchema(contracts);
export const selectContractSchema = createSelectSchema(contracts);

export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
