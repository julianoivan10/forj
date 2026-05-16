import { and, eq, messages, notifications, sql } from '@forj/db';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Inbox-summary router — one endpoint for the two badges that the
 * sidebar and dashboard header poll every 20-30 seconds:
 *   - unread messages count
 *   - unread notifications count
 *
 * Before this existed, both badges were two separate tRPC procedures
 * (`message.unreadCount`, `notification.unreadCount`) that the sidebar
 * fired in parallel. With `httpBatchLink` they ride one HTTP request,
 * but each still has its own context setup, auth check, DB round trip,
 * and Privy token verification. Combining them halves that cost — one
 * batch item, one auth pass, one trip to Neon, two `COUNT(*)::int` in
 * one parallel SQL.
 *
 * The original `message.unreadCount` and `notification.unreadCount`
 * procedures stay (other places call them directly), but the sidebar
 * now uses `inbox.summary` exclusively.
 *
 * Future expansion: add `unreadDisputes`, `actionRequired` (contracts
 * needing approval / revision), etc. as fields on the same payload —
 * one poll, all the badge state for the chrome.
 */
export const inboxRouter = createTRPCRouter({
  summary: protectedProcedure.query(async ({ ctx }) => {
    // Two COUNT(*) queries in parallel — `Promise.all` keeps total
    // latency close to whichever is slower, not the sum.
    const [msgRow, notifRow] = await Promise.all([
      ctx.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.receiverId, ctx.user.id),
            eq(messages.isRead, false),
          ),
        )
        .then((rows) => rows[0]),
      ctx.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, ctx.user.id),
            eq(notifications.isRead, false),
          ),
        )
        .then((rows) => rows[0]),
    ]);

    return {
      messages: Number(msgRow?.count ?? 0),
      notifications: Number(notifRow?.count ?? 0),
    };
  }),
});
