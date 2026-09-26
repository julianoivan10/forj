import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['client', 'freelancer', 'both']);

export const badgeTierEnum = pgEnum('badge_tier', [
  'none',
  'bronze',
  'silver',
  'gold',
  'diamond',
]);

export const jobCategoryEnum = pgEnum('job_category', [
  'development',
  'design',
  'writing',
  'marketing',
  'video',
  'audio',
  'data',
  'other',
]);

export const budgetTypeEnum = pgEnum('budget_type', ['fixed', 'hourly']);

export const currencyEnum = pgEnum('currency', ['USDC', 'USD']);

export const jobDurationEnum = pgEnum('job_duration', [
  'less_than_week',
  'one_to_four_weeks',
  'one_to_three_months',
  'more_than_three_months',
]);

export const experienceLevelEnum = pgEnum('experience_level', [
  'entry',
  'intermediate',
  'expert',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'draft',
  'open',
  'in_progress',
  'completed',
  'cancelled',
  'disputed',
]);

export const visibilityEnum = pgEnum('visibility', ['public', 'private']);

export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',
  'accepted',
  'rejected',
  'withdrawn',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['fiat', 'crypto']);

export const contractStatusEnum = pgEnum('contract_status', [
  'created',
  'funded',
  'in_progress',
  'submitted',
  'revision_requested',
  'completed',
  'disputed',
  'cancelled',
  'refunded',
]);

export const messageTypeEnum = pgEnum('message_type', ['text', 'file', 'system']);

export const notificationTypeEnum = pgEnum('notification_type', [
  // Proposal events
  'proposal_received',
  'proposal_accepted',
  'proposal_rejected',
  // Job lifecycle
  'job_awarded',
  // Messages
  'message_received',
  // Contracts / escrow
  'contract_funded',
  'contract_submitted',
  'contract_revision_requested',
  'contract_completed',
  'contract_disputed',
  'contract_cancelled',
  // Reviews
  'review_received',
  // System
  'system',
]);

/**
 * Which escrow contract generation backs a contract row. v2 rows keep the
 * legacy ForjEscrow flow; v3 rows follow the on-chain state machine.
 */
export const escrowVersionEnum = pgEnum('escrow_version', ['v2', 'v3']);

/**
 * Mirror of ForjEscrowV3.Status. Written ONLY from confirmed on-chain
 * events or direct chain reads, never from user intent.
 */
export const escrowOnchainStatusEnum = pgEnum('escrow_onchain_status', [
  'none',
  'funded',
  'submitted',
  'revision_requested',
  'disputed',
  'released',
  'refunded',
  'resolved',
]);

/** Escrow function a recorded transaction is expected to perform. */
export const escrowActionEnum = pgEnum('escrow_action', [
  'fund',
  'submit_work',
  'request_revision',
  'release',
  'release_after_review',
  'cancel_by_freelancer',
  'refund_after_deadline',
  'raise_dispute',
  'resolve_dispute',
  'resolve_expired_dispute',
]);

/** Lifecycle of a user-submitted escrow transaction as seen by Forj. */
export const escrowTxStatusEnum = pgEnum('escrow_tx_status', ['pending', 'confirmed', 'failed']);
