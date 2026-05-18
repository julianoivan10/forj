import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './users';

/**
 * Blog / articles table.
 *
 * Scope (MVP): admin-authored long-form content for the public
 * marketing site. Anyone signed in can read; only users in
 * `ADMIN_USER_IDS` can create/edit. We didn't introduce a separate
 * "writer" role yet because we have one admin author for now;
 * adding a `users.canPublishArticles` boolean is the natural next
 * step when we want non-admin authors.
 *
 * Status modelled as a nullable `publishedAt`:
 *   - NULL  → draft (visible only in /admin/articles)
 *   - set   → published at that moment (visible at /blog + /blog/<slug>)
 *
 * No `archivedAt` or soft-delete on articles — hard delete is fine
 * for content. If we need takedown audit later, surface a separate
 * `removed_articles` table; don't bolt soft-delete onto this one.
 *
 * `slug` is derived at create time from the title (kebab-case +
 * random suffix on collision). Once published it's stable — never
 * mutate the slug on edit, that would break inbound links + SEO.
 */
export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** URL slug. Unique. Generated at create time from the title. */
    slug: text('slug').notNull(),
    /** Display title — what the user sees in the list + on the
     *  article page hero. Length cap is generous; we trim on render. */
    title: text('title').notNull(),
    /** Short 1-3 sentence summary shown in the list view + as the
     *  OpenGraph description for sharing previews. Optional —
     *  if absent the list view falls back to the first N chars of
     *  content (handled at the route layer, not DB). */
    excerpt: text('excerpt'),
    /** Markdown body. Rendered via react-markdown on the public
     *  /blog/<slug> page. No length cap at DB level; the route
     *  validates ≤ 200kb to keep payloads sane. */
    content: text('content').notNull(),
    /** Cover image URL. Constrained at the API layer to the same
     *  approved-host whitelist as message attachments + service
     *  cover images (see `packages/api/src/lib/file-host.ts`). */
    coverImageUrl: text('cover_image_url'),
    /** Author. `restrict` on delete because deleting an admin who
     *  authored articles would orphan content — better to require
     *  a manual reassign first. */
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Publish state. NULL = draft, timestamp = published-at moment.
     *  Public queries filter on `IS NOT NULL`. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique slug index — primary lookup path for /blog/<slug>.
    // `uniqueIndex` enforces uniqueness at the DB layer; route-level
    // collision check is still done to surface a clean error message
    // before this constraint trips.
    uniqueIndex('articles_slug_unique_idx').on(table.slug),
    // Public list: newest-first published articles. Partial index
    // on `publishedAt IS NOT NULL` keeps the index size small (drafts
    // don't bloat it) and matches the exact predicate the public
    // route uses.
    index('articles_published_at_idx').on(table.publishedAt),
    // Author's drafts + history. Composite on (author, createdAt)
    // so the /admin/articles list (author POV) is a single Index Scan.
    index('articles_author_created_idx').on(table.authorId, table.createdAt),
  ],
);

export const articlesRelations = relations(articles, ({ one }) => ({
  author: one(users, {
    fields: [articles.authorId],
    references: [users.id],
  }),
}));

export const insertArticleSchema = createInsertSchema(articles);
export const selectArticleSchema = createSelectSchema(articles);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
