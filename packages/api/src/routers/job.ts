import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, ilike, inArray, jobs, lte, or, sql, users } from '@forj/db';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '../middleware/rate-limit';
import { clientProcedure, createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

const jobCategorySchema = z.enum([
  'development',
  'design',
  'writing',
  'marketing',
  'video',
  'audio',
  'data',
  'other',
]);

const jobDurationSchema = z.enum([
  'less_than_week',
  'one_to_four_weeks',
  'one_to_three_months',
  'more_than_three_months',
]);

const experienceLevelSchema = z.enum(['entry', 'intermediate', 'expert']);

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export const jobRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        search: z.string().optional(),
        categories: z.array(jobCategorySchema).optional(),
        budgetMin: z.number().optional(),
        budgetMax: z.number().optional(),
        experienceLevel: experienceLevelSchema.optional(),
        durations: z.array(jobDurationSchema).optional(),
        sort: z.enum(['latest', 'budget_high', 'budget_low', 'most_proposals']).default('latest'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(jobs.status, 'open'), eq(jobs.visibility, 'public')];

      if (input.search) {
        const searchPattern = `%${input.search}%`;
        const searchCondition = or(
          ilike(jobs.title, searchPattern),
          ilike(jobs.description, searchPattern),
        );
        if (searchCondition) conditions.push(searchCondition);
      }
      if (input.categories && input.categories.length > 0) {
        conditions.push(inArray(jobs.category, input.categories));
      }
      if (input.experienceLevel) {
        conditions.push(eq(jobs.experienceLevel, input.experienceLevel));
      }
      if (input.durations && input.durations.length > 0) {
        conditions.push(inArray(jobs.duration, input.durations));
      }
      if (input.budgetMin !== undefined) {
        conditions.push(gte(jobs.budgetMin, input.budgetMin.toString()));
      }
      if (input.budgetMax !== undefined) {
        conditions.push(lte(jobs.budgetMax, input.budgetMax.toString()));
      }

      const orderBy =
        input.sort === 'budget_high'
          ? desc(jobs.budgetMax)
          : input.sort === 'budget_low'
            ? jobs.budgetMin
            : input.sort === 'most_proposals'
              ? desc(jobs.proposalCount)
              : desc(jobs.createdAt);

      const items = await ctx.db.query.jobs.findMany({
        where: and(...conditions),
        orderBy: [orderBy],
        limit: input.limit + 1,
        with: {
          client: {
            columns: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              workScore: true,
              badgeTier: true,
            },
          },
        },
      });

      const hasMore = items.length > input.limit;
      const paged = hasMore ? items.slice(0, input.limit) : items;
      const nextCursor = hasMore ? paged[paged.length - 1]?.id : undefined;

      return { items: paged, nextCursor };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.slug, input.slug),
        with: {
          client: true,
        },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
      return job;
    }),

  getById: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const job = await ctx.db.query.jobs.findFirst({
      where: eq(jobs.id, input.id),
      with: { client: true },
    });
    if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
    return job;
  }),

  create: clientProcedure
    .input(
      z.object({
        title: z.string().min(8).max(120),
        description: z.string().min(50).max(10000),
        category: jobCategorySchema,
        subcategory: z.string().max(80).optional(),
        skills: z.array(z.string().max(40)).min(1).max(15),
        coverImageUrl: z.string().url().optional(),
        budgetType: z.enum(['fixed', 'hourly']),
        budgetMin: z.number().positive(),
        budgetMax: z.number().positive(),
        duration: jobDurationSchema,
        experienceLevel: experienceLevelSchema,
        attachments: z.array(z.string().url()).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(ctx.user.id, 'jobCreate', RATE_LIMITS.jobCreate);

      if (input.budgetMin > input.budgetMax) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'budgetMin must be <= budgetMax' });
      }

      const [job] = await ctx.db
        .insert(jobs)
        .values({
          clientId: ctx.user.id,
          title: input.title,
          slug: slugify(input.title),
          description: input.description,
          category: input.category,
          subcategory: input.subcategory,
          skills: input.skills,
          coverImageUrl: input.coverImageUrl,
          budgetType: input.budgetType,
          budgetMin: input.budgetMin.toString(),
          budgetMax: input.budgetMax.toString(),
          duration: input.duration,
          experienceLevel: input.experienceLevel,
          attachments: input.attachments ?? [],
          status: 'open',
        })
        .returning();

      return job;
    }),

  incrementView: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(jobs)
        .set({ viewCount: sql`${jobs.viewCount} + 1` })
        .where(eq(jobs.id, input.id));
      return { success: true };
    }),

  myJobs: clientProcedure.query(async ({ ctx }) => {
    return ctx.db.query.jobs.findMany({
      where: eq(jobs.clientId, ctx.user.id),
      orderBy: [desc(jobs.createdAt)],
    });
  }),

  publicByClient: publicProcedure
    .input(z.object({ clientId: z.string().uuid(), limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.jobs.findMany({
        where: and(
          eq(jobs.clientId, input.clientId),
          eq(jobs.visibility, 'public'),
        ),
        orderBy: [desc(jobs.createdAt)],
        limit: input.limit,
        columns: {
          id: true,
          slug: true,
          title: true,
          status: true,
          budgetType: true,
          budgetMin: true,
          budgetMax: true,
          proposalCount: true,
          createdAt: true,
        },
      });
    }),
});
