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
