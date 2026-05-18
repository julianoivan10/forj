import { TRPCError } from '@trpc/server';
import {
  and,
  articles,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  sql,
  users,
} from '@forj/db';
import { z } from 'zod';
import { isAllowedFileUrl } from '../lib/file-host';
import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
} from '../trpc';

/**
 * Articles / blog router.
 *
 * Public surface (anyone, including logged-out):
 *   - `list`     — published articles, newest first, cursor-paginated
 *   - `getBySlug` — single article by slug (must be published)
 *
 * Admin surface (gated by `ADMIN_USER_IDS` + `adminProcedure`):
 *   - `listAll`   — every article incl. drafts, newest first
 *   - `getById`   — single article by id (incl. drafts) — feeds the
 *                   admin edit form
 *   - `create`    — new draft (publishedAt null until publish())
 *   - `update`    — edit body + metadata; slug is immutable post-create
 *   - `publish`   — flip publishedAt to now()
 *   - `unpublish` — flip publishedAt to null (article disappears
 *                   from /blog without losing the row)
 *   - `remove`    — hard delete. No soft-delete here; if takedown
 *                   audit becomes a concern, add a `removed_articles`
 *                   table rather than bolt soft-delete onto this one.
 *
 * Slug strategy:
 *   Generated at create time from the title (kebab-case + 6-char
 *   random suffix). The random suffix avoids the "two drafts with
 *   the same title trip the unique constraint" race. The DB also
 *   has a unique index on slug as a hard backstop.
 */

const titleSchema = z.string().min(4).max(180);
const excerptSchema = z.string().max(500).optional();
// Content is markdown; cap at 200KB so a runaway editor doesn't
// drop a huge payload on the API. That's ~50k words at average
// English density — plenty for long-form.
const contentSchema = z.string().min(1).max(200_000);

const coverImageSchema = z
  .string()
  .url()
  .refine(isAllowedFileUrl, 'Cover image must come from UploadThing or Pinata.')
  .optional();

/**
 * kebab-case + random suffix. Strips non-alphanumeric, collapses
 * whitespace + hyphens, lowercases. Trailing 6-char base36 suffix
 * eliminates collisions in practice (~ 1 in 2 billion per pair).
 */
function slugify(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'article';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export const articleRouter = createTRPCRouter({
  /**
   * Public list. Cursor = `createdAt` of the last article on the
   * previous page. Default page size 12, max 24 — a list page card
   * is fairly chunky so larger pages feel slow.
   */
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(24).default(12),
          before: z.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 12;
      // Probe limit+1 trick: if we get more than `limit` rows, we
      // know there's another page. Trim before returning.
      const probeLimit = limit + 1;
      const where = input?.before
        ? and(
            isNotNull(articles.publishedAt),
            lt(articles.publishedAt, input.before),
          )
        : isNotNull(articles.publishedAt);

      const rows = await ctx.db.query.articles.findMany({
        where,
        orderBy: [desc(articles.publishedAt)],
        limit: probeLimit,
        columns: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverImageUrl: true,
          publishedAt: true,
        },
        with: {
          author: {
            columns: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const last = items[items.length - 1];
      const nextCursor = hasMore && last?.publishedAt ? last.publishedAt : null;

      return { items, hasMore, nextCursor };
    }),

  /**
   * Public read. Returns 404 if not found OR not published — the
   * two cases share a surface so unpublished drafts don't reveal
   * their existence via timing or error message differences.
   */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.db.query.articles.findFirst({
        where: and(
          eq(articles.slug, input.slug),
          isNotNull(articles.publishedAt),
        ),
        with: {
          author: {
            columns: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
            },
          },
        },
      });
      if (!article) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found.' });
      }
      return article;
    }),

  /**
   * Admin list — everything, drafts included. Useful for the
   * /admin/articles list where authors manage their drafts.
   */
  listAll: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          status: z.enum(['all', 'published', 'draft']).default('all'),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const status = input?.status ?? 'all';
      const where =
        status === 'published'
          ? isNotNull(articles.publishedAt)
          : status === 'draft'
            ? isNull(articles.publishedAt)
            : undefined;

      const rows = await ctx.db.query.articles.findMany({
        where,
        orderBy: [desc(articles.createdAt)],
        limit,
        columns: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        with: {
          author: {
            columns: { id: true, username: true, displayName: true },
          },
        },
      });
      return rows;
    }),

  /** Admin: fetch single article by id (incl. drafts) for the edit form. */
  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.db.query.articles.findFirst({
        where: eq(articles.id, input.id),
      });
      if (!article) throw new TRPCError({ code: 'NOT_FOUND' });
      return article;
    }),

  /** Admin: create a draft. */
  create: adminProcedure
    .input(
      z.object({
        title: titleSchema,
        excerpt: excerptSchema,
        content: contentSchema,
        coverImageUrl: coverImageSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug = slugify(input.title);
      const [created] = await ctx.db
        .insert(articles)
        .values({
          slug,
          title: input.title,
          excerpt: input.excerpt ?? null,
          content: input.content,
          coverImageUrl: input.coverImageUrl ?? null,
          authorId: ctx.user.id,
        })
        .returning();
      if (!created) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Article insert returned no row.',
        });
      }
      return created;
    }),

  /**
   * Admin: edit. Slug is intentionally NOT updateable — once
   * published, the URL is part of an external contract (inbound
   * links, search results). Title/excerpt/content/cover can change
   * freely.
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: titleSchema.optional(),
        excerpt: excerptSchema,
        content: contentSchema.optional(),
        coverImageUrl: coverImageSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.articles.findFirst({
        where: eq(articles.id, input.id),
        columns: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title;
      if (input.excerpt !== undefined) {
        patch.excerpt = input.excerpt === '' ? null : input.excerpt;
      }
      if (input.content !== undefined) patch.content = input.content;
      if (input.coverImageUrl !== undefined) {
        patch.coverImageUrl = input.coverImageUrl === '' ? null : input.coverImageUrl;
      }

      const [updated] = await ctx.db
        .update(articles)
        .set(patch)
        .where(eq(articles.id, input.id))
        .returning();
      return updated;
    }),

  /** Admin: flip publishedAt to now. Idempotent — re-publishing
   *  refreshes the publish timestamp, which doubles as "promote to
   *  top of the list" if needed. */
  publish: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(articles)
        .set({ publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(articles.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return updated;
    }),

  /** Admin: pull from public listings without deleting. */
  unpublish: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(articles)
        .set({ publishedAt: null, updatedAt: new Date() })
        .where(eq(articles.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return updated;
    }),

  /** Admin: hard delete. Use sparingly — published articles with
   *  inbound links should usually be unpublished, not deleted. */
  remove: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(articles).where(eq(articles.id, input.id));
      return { success: true };
    }),

  /** Public count for the marketing page — surfaces "X articles
   *  published" stats. Cheap COUNT against the partial-friendly
   *  publishedAt index. */
  publishedCount: publicProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(articles)
      .where(isNotNull(articles.publishedAt));
    return { count: Number(row?.count ?? 0) };
  }),
});

// Silence unused-import lint when the `users` table reference is
// only consumed transitively via the `author` relation.
void users;
