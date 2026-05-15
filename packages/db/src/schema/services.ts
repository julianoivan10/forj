import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { jobCategoryEnum } from './enums';
import { users } from './users';

/**
 * Services — freelancer-published "gigs". The Fiverr / Upwork Project
 * Catalog model: instead of waiting for a client to post a job, freelancers
 * publish productised offerings ("I will design your logo for $500, 3-day
 * delivery") that clients can purchase directly.
 *
 * How it composes with the existing job/proposal flow:
 *   - Both flows produce a `contracts` row at the moment money changes hands.
 *   - A service purchase skips the proposal step: client clicks "Buy",
 *     funds escrow, and a contract is created directly. The freelancer is
 *     notified and starts work.
 *   - The same on-chain escrow applies — services are just a different
 *     entry point, not a different settlement model.
 *
 * Tier model:
 *   `tiers` is a JSONB array of 1–3 packages (Basic / Standard / Premium —
 *   classic Fiverr pattern). Each tier has its own price + delivery time
 *   + scope. We don't break this into a separate `service_tiers` table
 *   because tiers are always edited as a unit and rarely queried
 *   independently — JSONB is the right granularity.
 */

export type ServiceTier = {
  /** Display name — "Basic", "Standard", "Premium" or freelancer's choice. */
  label: string;
  /** USDC price for this tier. */
  price: number;
  /** Delivery time in days. */
  deliveryDays: number;
  /** Number of revisions included. -1 means unlimited. */
  revisions: number;
  /** Free-form bullet points describing what's included. */
  features: string[];
};

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Public-facing
    title: text('title').notNull(),
    /** Short URL slug, unique platform-wide. e.g. "logo-design-modern". */
    slug: text('slug').notNull().unique(),
    /** 1–2 sentence elevator pitch shown on cards. */
    tagline: text('tagline').notNull(),
    /** Markdown body for the service detail page. */
    description: text('description').notNull(),

    category: jobCategoryEnum('category').notNull(),
    subcategory: text('subcategory'),
    skills: text('skills').array().notNull().default(sql`'{}'::text[]`),

    /** Cover image (IPFS or hosted). Optional. */
    coverImageUrl: text('cover_image_url'),
    /** Up to 5 portfolio sample images. */
    galleryUrls: text('gallery_urls').array().notNull().default(sql`'{}'::text[]`),

    /** 1–3 packages. Validated at the API layer. */
    tiers: jsonb('tiers').$type<ServiceTier[]>().notNull(),

    /** Cached "from $X" for cheap list rendering — derived from min(tiers.price). */
    priceFrom: numeric('price_from', { precision: 12, scale: 2 }).notNull(),

    /** Has the freelancer paused listing without deleting? */
    isActive: boolean('is_active').notNull().default(true),

    /** Cached counters — kept fresh on contract create / review insert. */
    ordersCompleted: integer('orders_completed').notNull().default(0),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).notNull().default('0'),
    reviewCount: integer('review_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('services_slug_idx').on(table.slug),
    index('services_freelancer_idx').on(table.freelancerId),
    index('services_category_idx').on(table.category),
    // Active services sorted by orders — feeds the discover page.
    index('services_active_orders_idx').on(table.isActive, table.ordersCompleted),
  ],
);

export const servicesRelations = relations(services, ({ one }) => ({
  freelancer: one(users, {
    fields: [services.freelancerId],
    references: [users.id],
  }),
}));

export const insertServiceSchema = createInsertSchema(services);
export const selectServiceSchema = createSelectSchema(services);

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
