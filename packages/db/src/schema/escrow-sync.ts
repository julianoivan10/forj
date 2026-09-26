import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { contracts } from './contracts';
import { escrowActionEnum, escrowTxStatusEnum } from './enums';
import { users } from './users';

/**
 * Every escrow transaction a user tells Forj about, from submission to
 * confirmation or failure. This is the "pending blockchain action" layer:
 * the UI shows it as waiting for confirmation, and nothing downstream
 * treats it as done until `status = 'confirmed'`, which is only set after
 * the receipt was fetched and the expected event was decoded from it.
 */
export const escrowTransactions = pgTable(
  'escrow_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'restrict' }),
    chainId: integer('chain_id').notNull(),
    escrowAddress: text('escrow_address').notNull(),
    action: escrowActionEnum('action').notNull(),
    txHash: text('tx_hash').notNull(),
    status: escrowTxStatusEnum('status').notNull().default('pending'),
    initiatedBy: uuid('initiated_by').references(() => users.id, { onDelete: 'set null' }),
    blockNumber: bigint('block_number', { mode: 'bigint' }),
    /** Off-chain data that accompanies the action (submission note, dispute reason). Copied to the contract only once confirmed. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    failureReason: text('failure_reason'),
    attempts: integer('attempts').notNull().default(0),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('escrow_tx_chain_hash_unique').on(table.chainId, table.txHash),
    // At most one in-flight escrow action per contract: blocks duplicate
    // clicks and conflicting parallel actions at the database level.
    uniqueIndex('escrow_tx_one_pending_per_contract')
      .on(table.contractId)
      .where(sql`${table.status} = 'pending'`),
    index('escrow_tx_status_idx').on(table.status, table.createdAt),
  ],
);

/**
 * Append-only log of decoded escrow events. `(chainId, txHash, logIndex)`
 * is unique, which makes ingestion idempotent: replays, and the same event
 * arriving through both the receipt path and the log indexer, insert
 * nothing new.
 */
export const escrowEvents = pgTable(
  'escrow_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chainId: integer('chain_id').notNull(),
    escrowAddress: text('escrow_address').notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
    blockHash: text('block_hash').notNull(),
    escrowId: bigint('escrow_id', { mode: 'bigint' }).notNull(),
    eventName: text('event_name').notNull(),
    args: jsonb('args').$type<Record<string, string | number | boolean>>().notNull(),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    /** Set once the event has been applied to its contract row. */
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('escrow_events_log_unique').on(table.chainId, table.txHash, table.logIndex),
    index('escrow_events_escrow_idx').on(table.chainId, table.escrowAddress, table.escrowId),
    index('escrow_events_unapplied_idx').on(table.appliedAt),
  ],
);

/** Highest block the log indexer has fully processed, per chain and escrow contract. */
export const indexerCursors = pgTable('indexer_cursors', {
  key: text('key').primaryKey(), // `${chainId}:${escrowAddress}`
  lastProcessedBlock: bigint('last_processed_block', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const escrowTransactionsRelations = relations(escrowTransactions, ({ one }) => ({
  contract: one(contracts, { fields: [escrowTransactions.contractId], references: [contracts.id] }),
  initiator: one(users, { fields: [escrowTransactions.initiatedBy], references: [users.id] }),
}));

export type EscrowTransaction = typeof escrowTransactions.$inferSelect;
export type EscrowEvent = typeof escrowEvents.$inferSelect;
