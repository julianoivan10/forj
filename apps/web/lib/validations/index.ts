import { z } from 'zod';

/* ── Shared enums ────────────────────────── */

export const jobCategorySchema = z.enum([
  'development',
  'design',
  'writing',
  'marketing',
  'video',
  'audio',
  'data',
  'other',
]);

export const jobDurationSchema = z.enum([
  'less_than_week',
  'one_to_four_weeks',
  'one_to_three_months',
  'more_than_three_months',
]);

export const experienceLevelSchema = z.enum(['entry', 'intermediate', 'expert']);
export const budgetTypeSchema = z.enum(['fixed', 'hourly']);
export const userRoleSchema = z.enum(['client', 'freelancer', 'both']);

/* ── Username ────────────────────────────── */

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9_-]+$/, 'Lowercase letters, numbers, _ or - only');

/* ── Job ─────────────────────────────────── */

export const createJobSchema = z
  .object({
    title: z.string().min(8, 'Title must be at least 8 characters').max(120),
    description: z.string().min(50, 'Description must be at least 50 characters').max(10000),
    category: jobCategorySchema,
    subcategory: z.string().max(80).optional(),
    skills: z.array(z.string().max(40)).min(1, 'At least one skill required').max(15),
    budgetType: budgetTypeSchema,
    budgetMin: z.number().positive('Budget must be positive'),
    budgetMax: z.number().positive('Budget must be positive'),
    duration: jobDurationSchema,
    experienceLevel: experienceLevelSchema,
    attachments: z.array(z.string().url()).max(10).optional(),
  })
  .refine((data) => data.budgetMin <= data.budgetMax, {
    message: 'Minimum budget must be ≤ maximum budget',
    path: ['budgetMin'],
  });

/* ── Proposal ────────────────────────────── */

export const milestoneSchema = z.object({
  title: z.string().min(1).max(120),
  amount: z.number().positive(),
  duration: z.string().max(80),
  description: z.string().max(500),
});

export const createProposalSchema = z.object({
  jobId: z.string().uuid(),
  coverLetter: z.string().min(50, 'Cover letter must be at least 50 characters').max(5000),
  bidAmount: z.number().positive('Bid amount must be positive'),
  bidType: budgetTypeSchema,
  estimatedDuration: z.string().min(1).max(80),
  milestones: z.array(milestoneSchema).max(10).optional(),
  attachments: z.array(z.string().url()).max(5).optional(),
});

/* ── Onboarding ──────────────────────────── */

export const onboardingSchema = z.object({
  username: usernameSchema,
  displayName: z.string().min(1, 'Display name is required').max(80),
  role: userRoleSchema,
  bio: z.string().max(500).optional(),
  skills: z.array(z.string().max(40)).max(20).optional(),
  country: z.string().max(80).optional(),
  timezone: z.string().max(80).optional(),
  hourlyRate: z.number().positive().optional(),
});

/* ── Profile update ──────────────────────── */

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  skills: z.array(z.string().max(40)).max(20).optional(),
  hourlyRate: z.number().positive().optional(),
  country: z.string().max(80).optional(),
  timezone: z.string().max(80).optional(),
});

/* ── Review ──────────────────────────────── */

export const createReviewSchema = z.object({
  contractId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10, 'Review must be at least 10 characters').max(2000),
  ratingBreakdown: z
    .object({
      communication: z.number().int().min(1).max(5),
      quality: z.number().int().min(1).max(5),
      deadline: z.number().int().min(1).max(5),
      professionalism: z.number().int().min(1).max(5),
    })
    .optional(),
});

/* ── Message ─────────────────────────────── */

export const sendMessageSchema = z.object({
  receiverId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  fileUrl: z.string().url().optional(),
});

/* ── Type exports ────────────────────────── */

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type CreateProposalInput = z.infer<typeof createProposalSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
