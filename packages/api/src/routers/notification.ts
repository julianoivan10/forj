import { and, desc, eq, notifications, sql } from '@forj/db';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const notificationRouter = createTRPCRouter({
  /**
   * List my notifications, newest first. Caps out at 50 — the full history
   * lives behind a `cursor`-style pagination we'll add when volumes demand it.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).default(30),
          unreadOnly: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { limit, unreadOnly } = input ?? { limit: 30, unreadOnly: false };
      const where = unreadOnly
        ? and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false))
        : eq(notifications.userId, ctx.user.id);

      return ctx.db.query.notifications.findMany({
        where,
        orderBy: [desc(notifications.createdAt)],
        limit,
        with: {
          actor: {
            columns: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      });
    }),

  /** Total unread — powers the bell badge. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false)),
      );
    return { count: Number(row?.count ?? 0) };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)),
        );
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false)),
      );
    return { success: true };
  }),
});
