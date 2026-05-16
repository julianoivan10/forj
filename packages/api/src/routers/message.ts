import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, messages, or, sql, users } from '@forj/db';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '../middleware/rate-limit';
import { notify } from '../services/notifications';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Deterministic conversation ID for a pair of users.
 * Using a composite `smaller:larger` string means the same pair always maps
 * to the same conversationId regardless of who messages first — no lookup
 * round trip needed before sending.
 */
function conversationIdFor(userA: string, userB: string): string {
  const [a, b] = [userA, userB].sort();
  return `${a}:${b}`;
}

/** Extract the other participant's user id from a conversationId of the form "a:b". */
function otherParty(conversationId: string, selfId: string): string | null {
  const [a, b] = conversationId.split(':');
  if (!a || !b) return null;
  if (a === selfId) return b;
  if (b === selfId) return a;
  return null;
}

export const messageRouter = createTRPCRouter({
  /**
   * Inbox — one row per conversation with the other party, last message preview,
   * and unread count (messages where receiverId = me and isRead = false).
   */
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.user.id;

    // 1. Aggregate per-conversation: last message time + unread count.
    const convos = await ctx.db
      .select({
        conversationId: messages.conversationId,
        lastMessageAt: sql<Date>`MAX(${messages.createdAt})`.as('last_message_at'),
        unreadCount: sql<number>`SUM(CASE WHEN ${messages.receiverId} = ${me} AND ${messages.isRead} = false THEN 1 ELSE 0 END)::int`.as(
          'unread_count',
        ),
      })
      .from(messages)
      .where(or(eq(messages.senderId, me), eq(messages.receiverId, me)))
      .groupBy(messages.conversationId)
      .orderBy(desc(sql`MAX(${messages.createdAt})`));

    if (convos.length === 0) return [];

    // 2. Fetch each conversation's latest message content + parties.
    // Done as parallel findFirst calls; cheap for the expected MVP volumes and
    // avoids window functions that Drizzle struggles to type.
    const details = await Promise.all(
      convos.map(async (c) => {
        const lastMessage = await ctx.db.query.messages.findFirst({
          where: eq(messages.conversationId, c.conversationId),
          orderBy: [desc(messages.createdAt)],
          columns: { id: true, content: true, senderId: true, receiverId: true, createdAt: true, type: true },
        });
        const otherId = otherParty(c.conversationId, me);
        const other = otherId
          ? await ctx.db.query.users.findFirst({
              where: eq(users.id, otherId),
              columns: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                workScore: true,
                badgeTier: true,
              },
            })
          : null;
        return {
          conversationId: c.conversationId,
          lastMessageAt: c.lastMessageAt,
          unreadCount: Number(c.unreadCount ?? 0),
          lastMessage: lastMessage ?? null,
          other: other ?? null,
        };
      }),
    );

    // Drop any orphaned rows where the other party was deleted
    return details.filter((d) => d.other !== null);
  }),

  /**
   * Fetch messages in a conversation. Verifies the caller is a participant
   * by decoding the conversationId.
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const me = ctx.user.id;
      const otherId = otherParty(input.conversationId, me);
      if (!otherId) throw new TRPCError({ code: 'FORBIDDEN' });

      const rows = await ctx.db.query.messages.findMany({
        where: eq(messages.conversationId, input.conversationId),
        orderBy: [asc(messages.createdAt)],
        limit: input.limit,
        with: {
          sender: {
            columns: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      const other = await ctx.db.query.users.findFirst({
        where: eq(users.id, otherId),
        columns: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          workScore: true,
          badgeTier: true,
          role: true,
        },
      });
      if (!other) throw new TRPCError({ code: 'NOT_FOUND', message: 'Other user not found' });

      return { messages: rows, other };
    }),

  /**
   * Return the conversationId for a pair of users. Used by UIs that want to
   * open a chat without needing to know the naming convention.
   */
  getOrStart: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot message yourself' });
      }
      const other = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: { id: true, username: true, displayName: true, avatarUrl: true },
      });
      if (!other) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return { conversationId: conversationIdFor(ctx.user.id, input.userId), other };
    }),

  send: protectedProcedure
    .input(
      z.object({
        receiverId: z.string().uuid(),
        content: z.string().min(1).max(5000),
        fileUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.receiverId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot message yourself' });
      }
      await checkRateLimit(ctx.user.id, 'messageSend', RATE_LIMITS.messageSend);

      const receiver = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.receiverId),
        columns: { id: true },
      });
      if (!receiver) throw new TRPCError({ code: 'NOT_FOUND', message: 'Receiver not found' });

      const conversationId = conversationIdFor(ctx.user.id, input.receiverId);
      const [message] = await ctx.db
        .insert(messages)
        .values({
          conversationId,
          senderId: ctx.user.id,
          receiverId: input.receiverId,
          content: input.content,
          fileUrl: input.fileUrl,
          type: input.fileUrl ? 'file' : 'text',
        })
        .returning();

      // Notify receiver — in-app only. `email-dispatch.ts` deliberately
      // skips `message_received` (would be noisy), so this just lands a
      // row in `notifications` for the bell badge + notifications page.
      // Best-effort: notify() swallows its own errors, message stays sent
      // even if the notification insert hiccups.
      const senderName =
        ctx.user.displayName ?? ctx.user.username ?? 'Someone';
      const preview = input.fileUrl
        ? 'Sent you an attachment'
        : input.content.length > 80
          ? `${input.content.slice(0, 77)}…`
          : input.content;
      await notify({
        userId: input.receiverId,
        actorId: ctx.user.id,
        type: 'message_received',
        title: `New message from ${senderName}`,
        body: preview,
        entityType: 'message',
        entityId: message.id,
        actionUrl: `/dashboard/messages/${encodeURIComponent(conversationId)}`,
        metadata: {
          conversationId,
          senderUsername: ctx.user.username ?? null,
        },
      });

      return message;
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Only mark messages I received (not ones I sent) as read.
      await ctx.db
        .update(messages)
        .set({ isRead: true })
        .where(
          and(
            eq(messages.conversationId, input.conversationId),
            eq(messages.receiverId, ctx.user.id),
            eq(messages.isRead, false),
          ),
        );
      return { success: true };
    }),

  /** Total unread messages across all conversations — for nav badge. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(messages)
      .where(and(eq(messages.receiverId, ctx.user.id), eq(messages.isRead, false)));
    return { count: Number(row?.count ?? 0) };
  }),
});
