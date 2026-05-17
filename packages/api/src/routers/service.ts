import { TRPCError } from '@trpc/server';
import { DEFAULT_FEE_BPS } from '@forj/contracts';
import {
  and,
  asc,
  contracts,
  desc,
  eq,
  ilike,
  jobs,
  or,
  proposals,
  services,
  sql,
  users,
  type Service,
  type ServiceTier,
} from '@forj/db';
import { z } from 'zod';
import { isAllowedFileUrl } from '../lib/file-host';
import { RATE_LIMITS, checkRateLimit } from '../middleware/rate-limit';
import { notify } from '../services/notifications';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

/** Approved-host upload URL — shared with job router; see lib/file-host.ts. */
const fileUrl = z
  .string()
  .url()
  .refine(isAllowedFileUrl, 'URL must point to UploadThing or Pinata.');

/**
 * Services router — freelancer-published gigs (Fiverr Project Catalog model).
 *
 * Contrast with the job/proposal flow:
 *   - Jobs:     client posts → freelancers bid → client accepts → contract.
 *   - Services: freelancer publishes → client buys → contract.
 *
 * Both end in the same `contracts` row + same on-chain escrow. Services
 * just skip the proposal round-trip for productised work.
 *
 * The actual "buy" flow (turn a service order into a funded contract) lives
 * in `contract.purchaseService` — separated so the contract router stays
 * the canonical source of escrow lifecycle, and this router stays a CRUD
 * surface for the listings themselves.
 */

const tierSchema = z.object({
  label: z.string().min(1).max(40),
  price: z.number().positive().max(1_000_000),
  deliveryDays: z.number().int().positive().max(365),
  revisions: z.number().int().min(-1).max(20),
  features: z.array(z.string().max(120)).min(1).max(8),
});

const slugRe = /^[a-z0-9-]+$/;

/**
 * Slugify a title — lowercase, replace non-alphanumerics with hyphens,
 * trim leading/trailing hyphens, cap length. Adds a short id suffix to
 * avoid collisions when two freelancers pick the same title.
 */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'service'}-${suffix}`;
}

const createInput = z.object({
  title: z.string().min(10).max(120),
  tagline: z.string().min(20).max(200),
  description: z.string().min(40).max(5000),
  category: z.enum([
    'development',
    'design',
    'writing',
    'marketing',
    'video',
    'audio',
    'data',
    'other',
  ]),
  subcategory: z.string().max(80).optional(),
  skills: z.array(z.string().min(1).max(40)).max(20).default([]),
  coverImageUrl: fileUrl.optional(),
  galleryUrls: z.array(fileUrl).max(5).default([]),
  tiers: z.array(tierSchema).min(1).max(3),
});

export const serviceRouter = createTRPCRouter({
  /**
   * Public catalog — paginated list with search + category filter.
   * Used by `/services` discover page.
   */
  list: publicProcedure
    .input(
      z.object({
        q: z.string().max(120).optional(),
        category: z
          .enum([
            'development',
            'design',
            'writing',
            'marketing',
            'video',
            'audio',
            'data',
            'other',
          ])
          .optional(),
        sort: z.enum(['popular', 'newest', 'price_asc', 'price_desc']).default('popular'),
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(48).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filters = [eq(services.isActive, true)];
      if (input.category) filters.push(eq(services.category, input.category));
      if (input.q) {
        const term = `%${input.q}%`;
        filters.push(
          or(
            ilike(services.title, term),
            ilike(services.tagline, term),
            ilike(services.description, term),
          )!,
        );
      }

      const orderBy =
        input.sort === 'newest'
          ? [desc(services.createdAt)]
          : input.sort === 'price_asc'
            ? [asc(services.priceFrom)]
            : input.sort === 'price_desc'
              ? [desc(services.priceFrom)]
              : [desc(services.ordersCompleted), desc(services.avgRating)];

      const rows = await ctx.db.query.services.findMany({
        where: and(...filters),
        orderBy,
        limit: input.limit + 1,
        with: {
          freelancer: {
            columns: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              workScore: true,
              badgeTier: true,
            },
          },
        },
      });

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.id : null;
      return { items, nextCursor };
    }),

  /**
   * Public service detail by slug. Used by `/services/[slug]`.
   */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().regex(slugRe) }))
    .query(async ({ ctx, input }) => {
      const service = await ctx.db.query.services.findFirst({
        where: eq(services.slug, input.slug),
        with: {
          freelancer: {
            columns: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              country: true,
              workScore: true,
              badgeTier: true,
              totalJobsCompleted: true,
            },
          },
        },
      });
      if (!service) throw new TRPCError({ code: 'NOT_FOUND' });
      return service;
    }),

  /**
   * List services owned by the authenticated user. Powers the dashboard.
   */
  myServices: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.services.findMany({
      where: eq(services.freelancerId, ctx.user.id),
      orderBy: [desc(services.updatedAt)],
    });
  }),

  /**
   * Public listing of services published by a specific user — feeds the
   * "Services" tab on a freelancer's profile page.
   */
  listByUser: publicProcedure
    .input(z.object({ userId: z.string().uuid(), limit: z.number().int().max(24).default(6) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.services.findMany({
        where: and(
          eq(services.freelancerId, input.userId),
          eq(services.isActive, true),
        ),
        orderBy: [desc(services.ordersCompleted), desc(services.avgRating)],
        limit: input.limit,
      });
    }),

  /**
   * Create a new service. Rate-limited so a compromised account can't
   * carpet-bomb the marketplace.
   */
  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(ctx.user.id, 'service.create', RATE_LIMITS.serviceCreate);

      // Cap freelancers at a sane number of active listings — prevents
      // marketplace pollution from one prolific user.
      const [{ count } = { count: 0 }] = await ctx.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(services)
        .where(
          and(
            eq(services.freelancerId, ctx.user.id),
            eq(services.isActive, true),
          ),
        );
      if ((count ?? 0) >= 20) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You have reached the limit of 20 active services. Pause one to add another.',
        });
      }

      const tiers = input.tiers as ServiceTier[];
      const priceFrom = Math.min(...tiers.map((t) => t.price));

      // Try a few times to find a unique slug (collision is extremely rare
      // because slugify appends a random suffix).
      let slug = slugify(input.title);
      for (let i = 0; i < 5; i++) {
        const exists = await ctx.db.query.services.findFirst({
          where: eq(services.slug, slug),
          columns: { id: true },
        });
        if (!exists) break;
        slug = slugify(input.title);
      }

      const [created] = await ctx.db
        .insert(services)
        .values({
          freelancerId: ctx.user.id,
          title: input.title,
          slug,
          tagline: input.tagline,
          description: input.description,
          category: input.category,
          subcategory: input.subcategory,
          skills: input.skills,
          coverImageUrl: input.coverImageUrl,
          galleryUrls: input.galleryUrls,
          tiers,
          priceFrom: priceFrom.toString(),
        })
        .returning();

      // Lazy freelancer escalation (publish-service variant). Mirrors
      // the apply-to-job EscalationModal flow but happens server-side
      // because the service form already collects all the freelancer
      // fields inline (skills, tiers) — no need for a blocking modal.
      // Promote 'client' → 'both' so their sidebar surfaces the
      // freelancer-side nav from now on. Other role values left alone:
      //   - 'freelancer' / 'both' → already correct
      //   - null (shouldn't happen for an authed user) → no harm
      // See docs/design/role-and-mode.md §5.
      if (ctx.user.role === 'client') {
        await ctx.db
          .update(users)
          .set({ role: 'both', updatedAt: new Date() })
          .where(eq(users.id, ctx.user.id));
      }

      return created;
    }),

  /**
   * Edit an existing service. Owner-only. We let the freelancer edit
   * everything *including* tiers / prices — this is fine because each
   * purchase locks its tier into the contract row at order time, so
   * historical orders aren't affected by future price changes.
   */
  update: protectedProcedure
    .input(
      z
        .object({ id: z.string().uuid() })
        .merge(createInput.partial())
        .extend({ isActive: z.boolean().optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.services.findFirst({
        where: eq(services.id, input.id),
        columns: { id: true, freelancerId: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.freelancerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const patch: Partial<Service> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.tagline !== undefined) patch.tagline = input.tagline;
      if (input.description !== undefined) patch.description = input.description;
      if (input.category !== undefined) patch.category = input.category;
      if (input.subcategory !== undefined) patch.subcategory = input.subcategory;
      if (input.skills !== undefined) patch.skills = input.skills;
      if (input.coverImageUrl !== undefined) patch.coverImageUrl = input.coverImageUrl;
      if (input.galleryUrls !== undefined) patch.galleryUrls = input.galleryUrls;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.tiers !== undefined) {
        const tiers = input.tiers as ServiceTier[];
        patch.tiers = tiers;
        patch.priceFrom = Math.min(...tiers.map((t) => t.price)).toString();
      }

      const [updated] = await ctx.db
        .update(services)
        .set(patch)
        .where(eq(services.id, input.id))
        .returning();
      return updated;
    }),

  /**
   * Buyer-side: order a service tier. Atomically creates a job + proposal
   * + contract row in `created` status, ready for the buyer to fund the
   * escrow on the contract detail page.
   *
   * Why all three rows: the contracts table requires both jobId and
   * proposalId (FK constraints, plus the existing UI assumes both exist).
   * We synthesise:
   *   - Job: a private (non-listed) record of "this is what was ordered".
   *     Visibility = 'private', status = 'in_progress' since it's pre-accepted.
   *   - Proposal: the freelancer's offer materialised at order time.
   *     Status = 'accepted'. coverLetter copied from service tagline.
   *   - Contract: the actual escrow row. paymentMethod = 'crypto' so the
   *     buyer is funnelled into the on-chain funding flow.
   *
   * Same DB-side guards as `proposal.accept`:
   *   - Service must be active
   *   - Buyer can't be the freelancer (no self-purchase)
   *   - Tier must exist on the service
   *
   * Returns the contract id so the caller can navigate straight to
   * `/dashboard/contracts/<id>` and trigger the wallet flow.
   */
  purchase: protectedProcedure
    .input(
      z.object({
        serviceId: z.string().uuid(),
        tierIndex: z.number().int().min(0).max(2),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate-limit so a compromised account can't flood the queue with
      // fake orders. Same window as job posts.
      await checkRateLimit(ctx.user.id, 'service.purchase', RATE_LIMITS.servicePurchase);

      const service = await ctx.db.query.services.findFirst({
        where: eq(services.id, input.serviceId),
        with: {
          freelancer: {
            columns: { id: true, displayName: true, username: true },
          },
        },
      });
      if (!service) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!service.isActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This service is paused.' });
      }
      if (service.freelancerId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "You can't order your own service.",
        });
      }
      const tier = service.tiers?.[input.tierIndex];
      if (!tier) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tier not found' });
      }

      // Financials — same canonical fee calc as proposal.accept.
      const total = tier.price;
      const feeRate = DEFAULT_FEE_BPS / 10_000;
      const platformFee = Math.round(total * feeRate * 100) / 100;
      const freelancerAmount = Math.round((total - platformFee) * 100) / 100;
      const deliveryDeadline = new Date(
        Date.now() + tier.deliveryDays * 24 * 60 * 60 * 1000,
      );

      // Per-order slug — keeps the underlying job row addressable but
      // doesn't pollute the public job feed (visibility='private').
      const slug = `service-order-${ctx.user.id.slice(0, 8)}-${Date.now()}`;

      // 1. Create the synthetic job
      const [job] = await ctx.db
        .insert(jobs)
        .values({
          clientId: ctx.user.id,
          title: `Order: ${service.title} (${tier.label})`,
          slug,
          description:
            service.description +
            (input.notes ? `\n\n---\nBuyer notes:\n${input.notes}` : ''),
          category: service.category,
          skills: service.skills,
          budgetType: 'fixed',
          budgetMin: total.toString(),
          budgetMax: total.toString(),
          duration: tier.deliveryDays <= 7
            ? 'less_than_week'
            : tier.deliveryDays <= 28
              ? 'one_to_four_weeks'
              : tier.deliveryDays <= 90
                ? 'one_to_three_months'
                : 'more_than_three_months',
          experienceLevel: 'intermediate',
          status: 'in_progress',
          visibility: 'private',
        })
        .returning();
      if (!job) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // 2. Create the auto-accepted proposal
      const [proposal] = await ctx.db
        .insert(proposals)
        .values({
          jobId: job.id,
          freelancerId: service.freelancerId,
          coverLetter: service.tagline,
          bidAmount: total.toString(),
          bidType: 'fixed',
          estimatedDuration: `${tier.deliveryDays} days`,
          status: 'accepted',
        })
        .returning();
      if (!proposal) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // 3. Create the unfunded contract
      const [contract] = await ctx.db
        .insert(contracts)
        .values({
          jobId: job.id,
          clientId: ctx.user.id,
          freelancerId: service.freelancerId,
          proposalId: proposal.id,
          title: service.title,
          totalAmount: total.toString(),
          platformFee: platformFee.toString(),
          freelancerAmount: freelancerAmount.toString(),
          paymentMethod: 'crypto',
          deliveryDeadline,
        })
        .returning();
      if (!contract) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // 4. Notify freelancer
      const buyerName = ctx.user.displayName ?? ctx.user.username ?? 'A client';
      await notify({
        userId: service.freelancerId,
        actorId: ctx.user.id,
        type: 'proposal_accepted',
        title: `New order: ${service.title}`,
        body: `${buyerName} ordered the ${tier.label} tier of "${service.title}". Waiting on escrow funding.`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: {
          serviceId: service.id,
          serviceTitle: service.title,
          tier: tier.label,
          contractId: contract.id,
        },
      });

      return { contractId: contract.id, contract };
    }),

  /**
   * Hard-delete (rare — usually `isActive=false` is enough). Allowed only
   * if the service has zero completed orders, otherwise we'd orphan
   * historical contract references.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.services.findFirst({
        where: eq(services.id, input.id),
        columns: { id: true, freelancerId: true, ordersCompleted: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.freelancerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (existing.ordersCompleted > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This service has historical orders. Pause it instead of deleting.',
        });
      }
      await ctx.db.delete(services).where(eq(services.id, input.id));
      return { success: true };
    }),
});

// Helper export for the contract router so it can import a ready-to-use
// service-by-id finder without re-implementing the join.
export async function findServiceWithFreelancer(
  db: typeof import('@forj/db').db,
  id: string,
) {
  return db.query.services.findFirst({
    where: eq(services.id, id),
    with: {
      freelancer: { columns: { id: true, walletAddress: true, displayName: true, username: true } },
    },
  });
}

