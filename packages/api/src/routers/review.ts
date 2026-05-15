import { TRPCError } from '@trpc/server';
import { and, contracts, count, desc, eq, reviews, sql, users } from '@forj/db';
import { z } from 'zod';
import { RATE_LIMITS, checkRateLimit } from '../middleware/rate-limit';
import { notify } from '../services/notifications';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

const ratingBreakdownSchema = z.object({
  communication: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  deadline: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
});

/**
 * WorkScore is a 0-100 reputation score derived from review ratings.
 * 5★ → 100 pts, 1★ → 20 pts (linear). Stored on `users.workScore` so
 * search/sort/badge tier can use it without an aggregate join.
 */
const ratingToPoints = (rating: number) => rating * 20;

export const reviewRouter = createTRPCRouter({
  /**
   * Public: list all reviews received by a user. Powers the profile page.
   */
  listByUser: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.reviews.findMany({
        // Only public reviews show on the public profile. The reviewer
        // chooses `isPublic` at submit time; respecting it here prevents
        // a deliberately-private review from leaking via the profile feed.
        where: and(
          eq(reviews.revieweeId, input.userId),
          eq(reviews.isPublic, true),
        ),
        orderBy: [desc(reviews.createdAt)],
        with: {
          reviewer: {
            columns: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    }),

  /**
   * Public: aggregate stats for a user's reviews. Cheap query the profile
   * page can use without pulling every review row.
   */
  statsByUser: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          total: count(reviews.id),
          avgRating: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
          avgCommunication: sql<number>`coalesce(avg(((${reviews.ratingBreakdown})->>'communication')::int), 0)::float`,
          avgQuality: sql<number>`coalesce(avg(((${reviews.ratingBreakdown})->>'quality')::int), 0)::float`,
          avgDeadline: sql<number>`coalesce(avg(((${reviews.ratingBreakdown})->>'deadline')::int), 0)::float`,
          avgProfessionalism: sql<number>`coalesce(avg(((${reviews.ratingBreakdown})->>'professionalism')::int), 0)::float`,
        })
        .from(reviews)
        // Match the visibility rule on `listByUser` so the count + averages
        // describe the *same set* the user can browse below — otherwise the
        // header would say "10 reviews · avg 4.2" but the list shows 7.
        .where(
          and(eq(reviews.revieweeId, input.userId), eq(reviews.isPublic, true)),
        );
      const r = rows[0];
      return {
        total: Number(r?.total ?? 0),
        avgRating: Number(r?.avgRating ?? 0),
        breakdown: {
          communication: Number(r?.avgCommunication ?? 0),
          quality: Number(r?.avgQuality ?? 0),
          deadline: Number(r?.avgDeadline ?? 0),
          professionalism: Number(r?.avgProfessionalism ?? 0),
        },
      };
    }),

  /**
   * Returns both reviews on a contract (mine + the other party's), if any.
   * Used by the contract detail page to render the "Reviews" section.
   */
  getByContract: protectedProcedure
    .input(z.object({ contractId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        columns: { id: true, clientId: true, freelancerId: true },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      const isParty =
        contract.clientId === ctx.user.id || contract.freelancerId === ctx.user.id;
      if (!isParty) throw new TRPCError({ code: 'FORBIDDEN' });

      const list = await ctx.db.query.reviews.findMany({
        where: eq(reviews.contractId, input.contractId),
        orderBy: [desc(reviews.createdAt)],
        with: {
          reviewer: {
            columns: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      // Split for the UI: which one is "from me" and which is "from them".
      const mine = list.find((r) => r.reviewerId === ctx.user.id) ?? null;
      const theirs = list.find((r) => r.reviewerId !== ctx.user.id) ?? null;
      return { all: list, mine, theirs };
    }),

  /**
   * Quick gate the UI uses before showing the "Leave review" CTA. Returns
   * whether this user is eligible to write a review on this contract right now.
   */
  canReview: protectedProcedure
    .input(z.object({ contractId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        columns: { id: true, clientId: true, freelancerId: true, status: true },
      });
      if (!contract) {
        return { canReview: false, reason: 'not_found' as const, alreadyReviewed: false };
      }
      const isParty =
        contract.clientId === ctx.user.id || contract.freelancerId === ctx.user.id;
      if (!isParty) {
        return { canReview: false, reason: 'forbidden' as const, alreadyReviewed: false };
      }
      if (contract.status !== 'completed') {
        return {
          canReview: false,
          reason: 'not_completed' as const,
          alreadyReviewed: false,
        };
      }
      const existing = await ctx.db.query.reviews.findFirst({
        where: and(
          eq(reviews.contractId, contract.id),
          eq(reviews.reviewerId, ctx.user.id),
        ),
        columns: { id: true },
      });
      if (existing) {
        return { canReview: false, reason: 'already_reviewed' as const, alreadyReviewed: true };
      }
      return { canReview: true, reason: 'ok' as const, alreadyReviewed: false };
    }),

  /**
   * Create a review for a completed contract. The reviewer is always the
   * caller; reviewee is derived (the other party). After insert we update
   * the reviewee's running `workScore` so reputation surfaces immediately
   * in search/lists/badge tier.
   */
  create: protectedProcedure
    .input(
      z.object({
        contractId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().min(10).max(2000),
        ratingBreakdown: ratingBreakdownSchema.optional(),
        isPublic: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate-limit per-user to prevent firehose against many contracts. The
      // (contractId, reviewerId) unique index already enforces "one per
      // contract", but we still don't want a script burning through reviews
      // across hundreds of contracts.
      await checkRateLimit(ctx.user.id, 'review.create', RATE_LIMITS.reviewCreate);

      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        columns: { id: true, clientId: true, freelancerId: true, status: true, title: true },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.status !== 'completed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You can only review a completed contract',
        });
      }
      const isClient = contract.clientId === ctx.user.id;
      const isFreelancer = contract.freelancerId === ctx.user.id;
      if (!isClient && !isFreelancer) throw new TRPCError({ code: 'FORBIDDEN' });

      const revieweeId = isClient ? contract.freelancerId : contract.clientId;

      // Idempotency: each reviewer can only post once per contract. The
      // compound unique index also enforces this at DB level — we check
      // first to return a friendlier error than a constraint violation.
      const duplicate = await ctx.db.query.reviews.findFirst({
        where: and(
          eq(reviews.contractId, input.contractId),
          eq(reviews.reviewerId, ctx.user.id),
        ),
        columns: { id: true },
      });
      if (duplicate) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already reviewed this contract',
        });
      }

      const [review] = await ctx.db
        .insert(reviews)
        .values({
          contractId: input.contractId,
          reviewerId: ctx.user.id,
          revieweeId,
          rating: input.rating,
          comment: input.comment,
          ratingBreakdown: input.ratingBreakdown,
          isPublic: input.isPublic ?? true,
        })
        .returning();

      // --- Reputation update: refresh reviewee's workScore as a true average
      // of all received ratings. We recompute from scratch to avoid drift if
      // earlier writes ever raced or if review_count was ever wrong.
      const [agg] = await ctx.db
        .select({
          n: count(reviews.id),
          avg: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
        })
        .from(reviews)
        .where(eq(reviews.revieweeId, revieweeId));

      const newScore = ratingToPoints(Number(agg?.avg ?? 0));
      await ctx.db
        .update(users)
        .set({ workScore: newScore.toFixed(2) })
        .where(eq(users.id, revieweeId));

      // Notify the reviewee — best effort, never blocks the review insert.
      const reviewerName = ctx.user.displayName ?? ctx.user.username ?? 'Someone';
      await notify({
        userId: revieweeId,
        actorId: ctx.user.id,
        type: 'review_received',
        title: `You received a ${input.rating}★ review`,
        body: `${reviewerName} reviewed your work on "${contract.title}".`,
        entityType: 'review',
        entityId: review!.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: { contractTitle: contract.title, rating: input.rating },
      });

      return review;
    }),
});
