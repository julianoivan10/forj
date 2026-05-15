import { and, desc, eq, ilike, jobs, or, services, sql, users } from '@forj/db';
import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';

/**
 * Global search router — backs the cmd-k palette.
 *
 * Returns a flat, paginated set of results across three result types
 * (jobs, services, freelancers). The frontend keys off the `kind`
 * discriminator to render the right preview row.
 *
 * Why a single `global` endpoint instead of three separate queries:
 *   - We want one debounce path, one loading indicator, one error
 *     surface. Multiplexing on the server is simpler than fan-in on
 *     the client.
 *   - The result limit per category is fixed (default 5 each) so the
 *     palette never overflows the viewport. A "see all" affordance
 *     in the UI then jumps to the dedicated list page with the query
 *     pre-applied (`/jobs?q=foo`, `/services?q=foo`, etc).
 *
 * Anonymous-safe: this is a `publicProcedure`. The palette works for
 * logged-out visitors too — they can search and click through to the
 * public surfaces, which is a useful conversion hook.
 */

const MIN_QUERY = 1;
const PER_CATEGORY = 5;

export const searchRouter = createTRPCRouter({
  global: publicProcedure
    .input(
      z.object({
        q: z.string().trim().min(MIN_QUERY).max(80),
      }),
    )
    .query(async ({ ctx, input }) => {
      // ILIKE is fine for MVP scale (under ~10k rows per table). When
      // we cross into pg_trgm / GIN territory we can swap the predicate
      // without touching the response shape.
      const like = `%${input.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

      const [jobRows, serviceRows, userRows] = await Promise.all([
        // Only surface open jobs — closed/cancelled ones noise up the
        // palette and aren't actionable for the searcher.
        ctx.db
          .select({
            id: jobs.id,
            title: jobs.title,
            slug: jobs.slug,
            category: jobs.category,
            budgetMin: jobs.budgetMin,
            budgetMax: jobs.budgetMax,
            budgetType: jobs.budgetType,
            coverImageUrl: jobs.coverImageUrl,
            createdAt: jobs.createdAt,
          })
          .from(jobs)
          .where(
            and(
              eq(jobs.status, 'open'),
              or(ilike(jobs.title, like), ilike(jobs.description, like)),
            ),
          )
          .orderBy(desc(jobs.createdAt))
          .limit(PER_CATEGORY),

        ctx.db
          .select({
            id: services.id,
            title: services.title,
            slug: services.slug,
            tagline: services.tagline,
            category: services.category,
            coverImageUrl: services.coverImageUrl,
            priceFrom: services.priceFrom,
          })
          .from(services)
          .where(
            and(
              eq(services.isActive, true),
              or(ilike(services.title, like), ilike(services.tagline, like)),
            ),
          )
          .orderBy(desc(services.ordersCompleted))
          .limit(PER_CATEGORY),

        // Match either display name or @username. Skip soft-deleted rows.
        ctx.db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            workScore: users.workScore,
            badgeTier: users.badgeTier,
            // `tagline` on the wire is a short user-facing description;
            // we map it from the `bio` column (no separate "tagline"
            // field on the users table). Falls back gracefully to null
            // for users who haven't filled out a bio.
            tagline: users.bio,
          })
          .from(users)
          .where(
            and(
              sql`${users.deletedAt} is null`,
              or(
                ilike(users.username, like),
                ilike(users.displayName, like),
                ilike(users.bio, like),
              ),
            ),
          )
          .orderBy(desc(users.workScore))
          .limit(PER_CATEGORY),
      ]);

      return {
        jobs: jobRows,
        services: serviceRows,
        users: userRows,
        totals: {
          jobs: jobRows.length,
          services: serviceRows.length,
          users: userRows.length,
        },
      };
    }),
});
