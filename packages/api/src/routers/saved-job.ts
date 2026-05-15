import { TRPCError } from '@trpc/server';
import { and, desc, eq, jobs, savedJobs, sql, users } from '@forj/db';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Bookmark / saved-jobs router.
 *
 * Each entry on `saved_jobs` is a (userId, jobId) pair — composite PK
 * doubles as the dedup constraint. The mutations are tiny because the
 * heavy lifting (FK + cascade) is delegated to the schema.
 *
 * Exposes:
 *   - toggle(jobId)    — flip the bookmark state. Returns the new value.
 *                         Used by the heart icon on JobCard / job detail.
 *   - isSaved(jobId)   — boolean for the heart icon's initial state on
 *                         a single job view.
 *   - list             — the user's saved jobs, paginated, with the
 *                         same shape as `job.list` so the UI can re-use
 *                         JobCard without translation.
 *   - count            — total saved by the user, for the sidebar badge.
 *
 * No public surface — saved jobs are private to the user. Anyone curious
 * about "who else saved this" would be answered by a future
 * `job.savedCount` view (cheap aggregate query), not exposed here.
 */
export const savedJobRouter = createTRPCRouter({
  /**
   * Idempotent toggle. Re-clicking a save does an unsave; clicking an
   * unsaved bookmark inserts. Returns the resulting state so the UI
   * can confirm without an extra `isSaved` round-trip.
   */
  toggle: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Make sure the job actually exists before recording a bookmark
      // for it — saves us from carrying dangling rows if a stale link
      // lands a duplicate-tab user on a deleted job.
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
        columns: { id: true },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });

      const existing = await ctx.db.query.savedJobs.findFirst({
        where: and(
          eq(savedJobs.userId, ctx.user.id),
          eq(savedJobs.jobId, input.jobId),
        ),
        columns: { jobId: true },
      });

      if (existing) {
        await ctx.db
          .delete(savedJobs)
          .where(
            and(eq(savedJobs.userId, ctx.user.id), eq(savedJobs.jobId, input.jobId)),
          );
        return { saved: false };
      }

      // ON CONFLICT DO NOTHING is belt-and-braces for the race where two
      // concurrent toggles both observe `!existing` and try to insert.
      // The PK guarantees at most one row regardless.
      await ctx.db
        .insert(savedJobs)
        .values({ userId: ctx.user.id, jobId: input.jobId })
        .onConflictDoNothing();
      return { saved: true };
    }),

  /**
   * Returns true if the current user has bookmarked this job. Used by
   * the heart icon on individual job pages — list views should hydrate
   * from `listIds` instead to avoid N+1 round-trips.
   */
  isSaved: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.savedJobs.findFirst({
        where: and(
          eq(savedJobs.userId, ctx.user.id),
          eq(savedJobs.jobId, input.jobId),
        ),
        columns: { jobId: true },
      });
      return Boolean(row);
    }),

  /**
   * Bulk membership check — used by the public jobs list to render the
   * heart-filled state for each card without N queries. Returns a Set
   * of jobIds the user has saved out of the candidates passed in.
   */
  listIds: protectedProcedure
    .input(z.object({ jobIds: z.array(z.string().uuid()).max(200) }))
    .query(async ({ ctx, input }) => {
      if (input.jobIds.length === 0) return [] as string[];
      const rows = await ctx.db.query.savedJobs.findMany({
        where: and(
          eq(savedJobs.userId, ctx.user.id),
          sql`${savedJobs.jobId} = ANY(${input.jobIds})`,
        ),
        columns: { jobId: true },
      });
      return rows.map((r) => r.jobId);
    }),

  /**
   * The user's saved jobs, newest first. Same select shape as `job.list`
   * so the frontend can re-render the JobCard without a translation
   * layer. Pagination uses a simple offset because the user's bookmark
   * set is bounded (most freelancers save < 50 jobs).
   */
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      const rows = await ctx.db
        .select({
          // Match the `job.list.items[number]` shape on the wire so
          // <JobCard> can consume this query result directly.
          id: jobs.id,
          clientId: jobs.clientId,
          title: jobs.title,
          slug: jobs.slug,
          description: jobs.description,
          category: jobs.category,
          skills: jobs.skills,
          coverImageUrl: jobs.coverImageUrl,
          budgetType: jobs.budgetType,
          budgetMin: jobs.budgetMin,
          budgetMax: jobs.budgetMax,
          duration: jobs.duration,
          experienceLevel: jobs.experienceLevel,
          status: jobs.status,
          proposalCount: jobs.proposalCount,
          createdAt: jobs.createdAt,
          savedAt: savedJobs.createdAt,
          client: {
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            avatarUrl: users.avatarUrl,
            workScore: users.workScore,
            badgeTier: users.badgeTier,
          },
        })
        .from(savedJobs)
        .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
        .innerJoin(users, eq(users.id, jobs.clientId))
        .where(eq(savedJobs.userId, ctx.user.id))
        .orderBy(desc(savedJobs.createdAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return { items, hasMore };
    }),

  /** Lightweight count for sidebar / header badges. */
  count: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(savedJobs)
      .where(eq(savedJobs.userId, ctx.user.id));
    return row?.count ?? 0;
  }),
});
