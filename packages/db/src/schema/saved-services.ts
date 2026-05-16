import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { services } from './services';
import { users } from './users';

/**
 * Many-to-many: which users have bookmarked which services.
 *
 * Mirrors `saved_jobs` exactly — composite PK, cascade FKs, an index for
 * "this user's saves newest first" and one for "how many users saved
 * this service" (social proof). Different table because the
 * relationship target is `services`, not `jobs`.
 *
 * Use case: a CLIENT-mode user browsing the services catalog wants to
 * bookmark a designer's "Logo redesign — $200" service to come back to
 * later. Same UX pattern as freelancers saving jobs.
 */
export const savedServices = pgTable(
  'saved_services',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.serviceId] }),
    index('saved_services_user_created_idx').on(table.userId, table.createdAt),
    index('saved_services_service_idx').on(table.serviceId),
  ],
);

export type SavedService = typeof savedServices.$inferSelect;
