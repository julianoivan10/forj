import { TRPCError } from '@trpc/server';
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  messages,
  or,
  sql,
  users,
} from '@forj/db';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '../middleware/rate-limit';
import { notify } from '../services/notifications';
import { createTRPCRouter, protectedProcedure } from '../trpc';

/**
 * Whitelist of hostnames the message attachment URL can point to.
 * Sole upload paths today are UploadThing (`utfs.io`) and Pinata's
 * public IPFS gateway (`gateway.pinata.cloud`) — same set as
 * `next.config.ts` remotePatterns. Anything else gets rejected to
 * prevent attackers from pasting phishing/malware/`javascript:` URLs
 * as "attachments" that the inbox would surface as clickable links.
 *
 * Add new domains here AFTER vetting them — don't accept arbitrary
 * URLs even if zod `.url()` would parse them. (`z.string().url()`
 * accepts `javascript:`, `data:`, `ftp:`, etc.)
 */
const ALLOWED_FILE_HOSTS = new Set<string>([
  'utfs.io',
  'gateway.pinata.cloud',
]);

function isAllowedFileUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  // Reject any non-https scheme. Blocks `javascript:`, `data:`, plain
  // `http:`, etc. — even if the hostname happens to match.
  if (url.protocol !== 'https:') return false;
  return ALLOWED_FILE_HOSTS.has(url.hostname);
}

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

    // Was 2N+1 — one findFirst per conversation for the last message,
    // another for the other-party user. Replaced with two batch
    // queries + an in-memory join. For a user with 20 conversations:
    //   before: 1 + 20 + 20 = 41 round trips
    //   after:  1 + 1  + 1  = 3 round trips
    // Window function for "last message per conversation" uses
    // Postgres `DISTINCT ON` via Drizzle's selectDistinctOn helper —
    // same plan as the equivalent window query but simpler to read.
    const conversationIds = convos.map((c) => c.conversationId);
    const otherIds = conversationIds
      .map((cid) => otherParty(cid, me))
      .filter((id): id is string => id !== null);

    // 2. Last message per conversation. ORDER BY must lead with the
    // DISTINCT ON column (Postgres requirement) — conversationId
    // first, then createdAt DESC picks the newest row per group.
    const lastMessages =
      conversationIds.length === 0
        ? []
        : await ctx.db
            .selectDistinctOn([messages.conversationId], {
              conversationId: messages.conversationId,
              id: messages.id,
              content: messages.content,
              senderId: messages.senderId,
              receiverId: messages.receiverId,
              createdAt: messages.createdAt,
              type: messages.type,
            })
            .from(messages)
            .where(inArray(messages.conversationId, conversationIds))
            .orderBy(messages.conversationId, desc(messages.createdAt));

    // 3. Other parties — batch fetch, filter soft-deleted in-DB so we
    // don't pull anonymised PII back over the wire.
    const otherUsers =
      otherIds.length === 0
        ? []
        : await ctx.db.query.users.findMany({
            where: and(inArray(users.id, otherIds), isNull(users.deletedAt)),
            columns: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              workScore: true,
              badgeTier: true,
            },
          });

    // In-memory join. Maps keep the per-conversation lookup at O(1).
    const lastByConv = new Map(lastMessages.map((m) => [m.conversationId, m]));
    const userById = new Map(otherUsers.map((u) => [u.id, u]));

    const details = convos.map((c) => {
      const otherId = otherParty(c.conversationId, me);
      const lm = lastByConv.get(c.conversationId);
      // Strip conversationId from the message payload — the caller
      // already has it on the outer object, and keeping the inner
      // shape matches what consumers expected before this rewrite.
      const lastMessage = lm
        ? {
            id: lm.id,
            content: lm.content,
            senderId: lm.senderId,
            receiverId: lm.receiverId,
            createdAt: lm.createdAt,
            type: lm.type,
          }
        : null;
      return {
        conversationId: c.conversationId,
        lastMessageAt: c.lastMessageAt,
        unreadCount: Number(c.unreadCount ?? 0),
        lastMessage,
        other: otherId ? (userById.get(otherId) ?? null) : null,
      };
    });

    // Drop any orphaned rows where the other party was deleted
    return details.filter((d) => d.other !== null);
  }),

  /**
   * Fetch messages in a conversation. Verifies the caller is a participant
   * by decoding the conversationId.
   */
  /**
   * Fetch a window of messages in a conversation. Cursor-paginated so
   * long threads can lazily load older history without dragging the
   * whole conversation over the wire.
   *
   * Behaviour:
   *   - `before` undefined → return the newest `limit` messages.
   *   - `before` set → return the newest `limit` messages whose
   *     createdAt is strictly less than the cursor.
   *   - Internally we fetch DESC + limit, then reverse to ASC for the
   *     caller so the UI can render top-down without re-sorting.
   *   - `hasMore` is the "would we have returned more if limit was
   *     bigger" flag — used by the client to decide whether to show
   *     a "Load older" button.
   *   - `nextCursor` is the createdAt of the OLDEST message in the
   *     current page. Pass it back as `before` to fetch the page
   *     before this one.
   *
   * Auth: caller must be a participant in the conversation. Decoded
   * from the composite conversationId (`smaller:larger` of user ids).
   *
   * Performance: the `messages_conversation_created_idx` composite
   * index covers (conversationId, createdAt) — both the equality
   * predicate and the ORDER BY DESC walk the same index in one scan.
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        // Date cursor for "load older". Undefined = first page (newest).
        before: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const me = ctx.user.id;
      const otherId = otherParty(input.conversationId, me);
      if (!otherId) throw new TRPCError({ code: 'FORBIDDEN' });

      // Fetch one row beyond the requested limit so we can tell the
      // caller whether there's MORE history past this page without a
      // second roundtrip. Trimmed back to `limit` before returning.
      const probeLimit = input.limit + 1;

      const where = input.before
        ? and(
            eq(messages.conversationId, input.conversationId),
            lt(messages.createdAt, input.before),
          )
        : eq(messages.conversationId, input.conversationId);

      // Newest-first server-side so `limit` clips the right end of the
      // window. Reverse to ASC for the caller — chats render
      // chronologically (oldest at top of the current page, newest at
      // the bottom).
      const rowsDesc = await ctx.db.query.messages.findMany({
        where,
        orderBy: [desc(messages.createdAt)],
        limit: probeLimit,
        with: {
          sender: {
            columns: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      const hasMore = rowsDesc.length > input.limit;
      const trimmed = hasMore ? rowsDesc.slice(0, input.limit) : rowsDesc;
      const rows = trimmed.slice().reverse(); // ASC for display
      // Cursor = createdAt of the oldest message we just returned.
      // null when there's no more history in either direction (which
      // we infer from `!hasMore`).
      const nextCursor = hasMore && rows.length > 0 ? rows[0].createdAt : null;

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

      return { messages: rows, other, hasMore, nextCursor };
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
      // Hide soft-deleted users — opening a chat with a deleted account
      // would surface their (now anonymised) profile and let you fire
      // messages they'll never see. NOT_FOUND for both "no such user"
      // and "user left" keeps the account-deletion private.
      const other = await ctx.db.query.users.findFirst({
        where: and(eq(users.id, input.userId), isNull(users.deletedAt)),
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
      if (input.fileUrl && !isAllowedFileUrl(input.fileUrl)) {
        // Caught at the boundary so attackers can't bypass via the
        // tRPC client. zod's `.url()` accepts `javascript:` / `data:`
        // / any host — we need a stricter whitelist for anything
        // that becomes a clickable `<a href>` in the inbox UI.
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Attachment URL must come from an approved host (UploadThing or Pinata).',
        });
      }
      // Global per-sender rate limit (60/min) covers floods. We also
      // throttle per-(sender, receiver) pair so a single user can't
      // DM-bomb a specific person within the global budget. 10 per
      // minute is enough for a natural chat pace + still permits
      // bursts of short replies.
      await checkRateLimit(ctx.user.id, 'messageSend', RATE_LIMITS.messageSend);
      await checkRateLimit(
        `${ctx.user.id}:${input.receiverId}`,
        'messageSendToReceiver',
        RATE_LIMITS.messageSendToReceiver,
      );

      const receiver = await ctx.db.query.users.findFirst({
        where: and(eq(users.id, input.receiverId), isNull(users.deletedAt)),
        columns: { id: true },
      });
      if (!receiver) {
        // NOT_FOUND covers both "no such user" and "user soft-deleted
        // their account". We don't expose which — same surface for
        // both keeps account-deletion private (you can tell someone
        // exists by trying to DM them, but you can't tell they left).
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Receiver not found' });
      }

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
