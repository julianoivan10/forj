import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { users } from './users';

/**
 * Many-to-many: which users have bookmarked which jobs.
 *
 * Composite PK `(userId, jobId)` is the natural key — a user can bookmark
 * the same job at most once, and a join table doesn't need a synthetic
 * id. PK doubles as the dedup index, so we don't need a separate unique
 * constraint.
 *
 * Cascade behaviour:
 *   - On user delete  → drop their bookmarks (no FK pointing here from
 *     anywhere else, safe).
 *   - On job delete   → drop the bookmarks too (a bookmark of a deleted
 *     job is dead weight).
 *
 * The lookup pattern is "give me the user's bookmarks ordered by recency"
 * which is why we keep `createdAt` indexed alongside `userId`.
 */
export const savedJobs = pgTable(
  'saved_jobs',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.jobId] }),
    // Index for "list this user's bookmarks, newest first".
    index('saved_jobs_user_created_idx').on(table.userId, table.createdAt),
    // Index for "how many users bookmarked this job" (social proof).
    index('saved_jobs_job_idx').on(table.jobId),
  ],
);

export type SavedJob = typeof savedJobs.$inferSelect;
