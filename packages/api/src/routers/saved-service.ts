import { TRPCError } from '@trpc/server';
import { and, desc, eq, savedServices, services, sql, users } from '@forj/db';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Bookmark / saved-services router.
 *
 * Direct sibling of `savedJob` — same shape, different target. Mostly
 * for client-mode users who browse the services catalog and want to
 * earmark "I might hire this designer next month".
 *
 * Toggle is optimistic on the client side. The DB write uses an
 * `ON CONFLICT DO NOTHING` on insert so race conditions (rapid double-
 * tap on the heart icon) don't error out.
 */
export const savedServiceRouter = createTRPCRouter({
  toggle: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const service = await ctx.db.query.services.findFirst({
        where: eq(services.id, input.serviceId),
        columns: { id: true },
      });
      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      const existing = await ctx.db.query.savedServices.findFirst({
        where: and(
          eq(savedServices.userId, ctx.user.id),
          eq(savedServices.serviceId, input.serviceId),
        ),
        columns: { serviceId: true },
      });

      if (existing) {
        await ctx.db
          .delete(savedServices)
          .where(
            and(
              eq(savedServices.userId, ctx.user.id),
              eq(savedServices.serviceId, input.serviceId),
            ),
          );
        return { saved: false };
      }

      await ctx.db
        .insert(savedServices)
        .values({ userId: ctx.user.id, serviceId: input.serviceId })
        .onConflictDoNothing();
      return { saved: true };
    }),

  isSaved: protectedProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.savedServices.findFirst({
        where: and(
          eq(savedServices.userId, ctx.user.id),
          eq(savedServices.serviceId, input.serviceId),
        ),
        columns: { serviceId: true },
      });
      return Boolean(row);
    }),

  listIds: protectedProcedure
    .input(z.object({ serviceIds: z.array(z.string().uuid()).max(200) }))
    .query(async ({ ctx, input }) => {
      if (input.serviceIds.length === 0) return [] as string[];
      const rows = await ctx.db.query.savedServices.findMany({
        where: and(
          eq(savedServices.userId, ctx.user.id),
          sql`${savedServices.serviceId} = ANY(${input.serviceIds})`,
        ),
        columns: { serviceId: true },
      });
      return rows.map((r) => r.serviceId);
    }),

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
          id: services.id,
          freelancerId: services.freelancerId,
          title: services.title,
          slug: services.slug,
          tagline: services.tagline,
          category: services.category,
          coverImageUrl: services.coverImageUrl,
          priceFrom: services.priceFrom,
          ordersCompleted: services.ordersCompleted,
          avgRating: services.avgRating,
          reviewCount: services.reviewCount,
          createdAt: services.createdAt,
          savedAt: savedServices.createdAt,
          freelancer: {
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            avatarUrl: users.avatarUrl,
            workScore: users.workScore,
            badgeTier: users.badgeTier,
          },
        })
        .from(savedServices)
        .innerJoin(services, eq(services.id, savedServices.serviceId))
        .innerJoin(users, eq(users.id, services.freelancerId))
        .where(eq(savedServices.userId, ctx.user.id))
        .orderBy(desc(savedServices.createdAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return { items, hasMore };
    }),

  count: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(savedServices)
      .where(eq(savedServices.userId, ctx.user.id));
    return row?.count ?? 0;
  }),
});
