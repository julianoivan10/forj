import { TRPCError } from '@trpc/server';
import { and, contracts, eq, inArray, isNull, jobs, messages, notifications, or, proposals, reviews, users } from '@forj/db';
import { WelcomeEmail, sendEmail } from '@forj/email';
import { z } from 'zod';
import { isAllowedFileUrl } from '../lib/file-host';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_-]+$/, 'Username: lowercase letters, numbers, _ or - only');

/**
 * Notification preference channel map shape. Each key is a notification type
 * (matching the DB `notification_type` enum), value `false` means opt-out.
 * Absent keys mean "use default" (ON).
 */
const notifChannelSchema = z.record(z.string(), z.boolean()).optional();

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => ctx.user),

  getByUsername: publicProcedure
    .input(z.object({ username: usernameSchema }))
    .query(async ({ ctx, input }) => {
      // Project ONLY public-safe columns. The full user row contains
      // `email`, `privyId`, and `notificationPreferences` which must
      // never leave the server for someone else's account. The previous
      // implementation returned the entire row (PII leak).
      //
      // What stays public:
      //   - identity     : id, username, displayName, avatarUrl, bio, role
      //   - reputation   : workScore, badgeTier, totalJobsCompleted,
      //                    totalEarned, isVerified
      //   - searchable   : skills, hourlyRate, country, timezone,
      //                    portfolioIpfsHash
      //   - on-chain     : walletAddress (already published on-chain)
      //   - housekeeping : createdAt
      const user = await ctx.db.query.users.findFirst({
        // Soft-deleted accounts return 404 — their username has been
        // NULL'd at delete time anyway, defence-in-depth against any race.
        where: and(eq(users.username, input.username), isNull(users.deletedAt)),
        columns: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          role: true,
          skills: true,
          hourlyRate: true,
          country: true,
          timezone: true,
          portfolioIpfsHash: true,
          workScore: true,
          badgeTier: true,
          totalJobsCompleted: true,
          totalEarned: true,
          isVerified: true,
          walletAddress: true,
          createdAt: true,
        },
      });
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      return user;
    }),

  checkUsernameAvailable: publicProcedure
    .input(z.object({ username: usernameSchema }))
    .query(async ({ ctx, input }) => {
      // Filter soft-deleted rows — deleted users' usernames are
      // released to be reclaimed (that's the deletion contract).
      // Without this filter, a `deleted` row's old username would
      // forever block new signups.
      const existing = await ctx.db.query.users.findFirst({
        where: and(eq(users.username, input.username), isNull(users.deletedAt)),
        columns: { id: true },
      });
      return { available: !existing };
    }),

  completeOnboarding: protectedProcedure
    .input(
      z.object({
        username: usernameSchema,
        displayName: z.string().min(1).max(80),
        role: z.enum(['client', 'freelancer', 'both']),
        bio: z.string().max(500).optional(),
        skills: z.array(z.string().max(40)).max(20).optional(),
        country: z.string().max(80).optional(),
        timezone: z.string().max(80).optional(),
        hourlyRate: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Same soft-delete filter as checkUsernameAvailable — must
      // be consistent or a username can be "available" in the
      // check but throw CONFLICT on onboarding submit.
      const existing = await ctx.db.query.users.findFirst({
        where: and(eq(users.username, input.username), isNull(users.deletedAt)),
        columns: { id: true },
      });
      if (existing && existing.id !== ctx.user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Username taken' });
      }

      const wasOnboarded = ctx.user.isOnboarded;

      const [updated] = await ctx.db
        .update(users)
        .set({
          username: input.username,
          displayName: input.displayName,
          role: input.role,
          bio: input.bio,
          skills: input.skills ?? [],
          country: input.country,
          timezone: input.timezone,
          hourlyRate: input.hourlyRate?.toString(),
          isOnboarded: true,
        })
        .where(eq(users.id, ctx.user.id))
        .returning();

      if (!wasOnboarded && updated?.email) {
        try {
          await sendEmail({
            to: updated.email,
            subject: `Welcome to WorkChain, ${updated.displayName ?? updated.username}`,
            react: WelcomeEmail({
              displayName: updated.displayName ?? updated.username ?? 'there',
              role: updated.role,
            }),
          });
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[user.completeOnboarding] welcome email failed:', err);
          }
        }
      }

      return updated;
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(80).optional(),
        bio: z.string().max(500).optional(),
        // Avatar must come from an approved host (UploadThing / Pinata).
        // Empty string clears the field. Same whitelist as message
        // attachments — see packages/api/src/lib/file-host.ts.
        avatarUrl: z
          .string()
          .max(2000)
          .refine(
            (v) => v === '' || isAllowedFileUrl(v),
            'Avatar must come from UploadThing or Pinata.',
          )
          .optional(),
        skills: z.array(z.string().max(40)).max(20).optional(),
        hourlyRate: z.number().positive().optional(),
        country: z.string().max(80).optional(),
        timezone: z.string().max(80).optional(),
        // Portfolio URL — Behance, personal site, GitHub, etc. Stored
        // in the legacy `portfolioIpfsHash` column (named when we
        // expected only IPFS hashes). Accept any https URL OR empty
        // string (used to clear the field).
        portfolioUrl: z
          .string()
          .max(500)
          .refine(
            (v) => v === '' || /^https?:\/\//.test(v),
            'Must be a valid URL starting with http:// or https://',
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Build the column-level patch — input keys aren't 1:1 with
      // DB columns (portfolioUrl → portfolioIpfsHash, hourlyRate is
      // text in DB so we stringify).
      const { portfolioUrl, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest };
      if (input.avatarUrl === '') patch.avatarUrl = null;
      if (input.hourlyRate != null) patch.hourlyRate = input.hourlyRate.toString();
      if (portfolioUrl !== undefined) {
        patch.portfolioIpfsHash = portfolioUrl === '' ? null : portfolioUrl;
      }

      const [updated] = await ctx.db
        .update(users)
        .set(patch)
        .where(eq(users.id, ctx.user.id))
        .returning();
      return updated;
    }),

  /**
   * Updates the user's preferred mode (`client` / `freelancer` / `both`).
   *
   * "Mode" is purely a UI affordance — the data model doesn't restrict
   * what a user can DO based on role. A user in `client` mode can still
   * apply to a job (the UI will prompt them to fill the lazy freelancer
   * profile fields first). The switcher is for surface visibility:
   * which nav items are prominent, which dashboard hero copy shows.
   *
   * Persisted to the DB so the preference survives across devices.
   * Mirrored to localStorage on the client for instant re-render
   * without a round-trip.
   */
  setRole: protectedProcedure
    .input(z.object({ role: z.enum(['client', 'freelancer', 'both']) }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, ctx.user.id))
        .returning();
      return updated;
    }),

  // ── Notification Preferences ─────────────────────────────────
  updateNotificationPreferences: protectedProcedure
    .input(
      z.object({
        inApp: notifChannelSchema,
        email: notifChannelSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({
          notificationPreferences: {
            inApp: input.inApp ?? {},
            email: input.email ?? {},
          },
        })
        .where(eq(users.id, ctx.user.id))
        .returning();
      return updated;
    }),

  // ── Data Export (GDPR) ───────────────────────────────────────
  /**
   * Returns a JSON blob of everything we store about the user: profile,
   * jobs, proposals, contracts, reviews, messages, notifications. The
   * frontend serves this as a downloadable .json file.
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const id = ctx.user.id;

    const [myJobs, myProposals, myContracts, myReviews, myMessages, myNotifications] =
      await Promise.all([
        ctx.db.query.jobs.findMany({
          where: eq(jobs.clientId, id),
        }),
        ctx.db.query.proposals.findMany({
          where: eq(proposals.freelancerId, id),
        }),
        ctx.db.query.contracts.findMany({
          where: or(eq(contracts.clientId, id), eq(contracts.freelancerId, id)),
        }),
        ctx.db.query.reviews.findMany({
          where: or(eq(reviews.reviewerId, id), eq(reviews.revieweeId, id)),
        }),
        ctx.db.query.messages.findMany({
          where: or(eq(messages.senderId, id), eq(messages.receiverId, id)),
        }),
        ctx.db.query.notifications.findMany({
          where: eq(notifications.userId, id),
        }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: ctx.user,
      jobs: myJobs,
      proposals: myProposals,
      contracts: myContracts,
      reviews: myReviews,
      messages: myMessages,
      notifications: myNotifications,
    };
  }),

  // ── Delete Account (Soft-Delete) ─────────────────────────────
  /**
   * Soft-delete with active-contract guard. If the user has any contract in
   * an "active" state (funded, in_progress, submitted, revision_requested),
   * we refuse deletion — they need to complete or cancel those first.
   *
   * On delete we:
   * 1. Anonymise PII (email, displayName, bio, avatar, skills)
   * 2. Set `deletedAt` timestamp
   * 3. Keep the row so foreign-key references remain valid
   *
   * The user must confirm by providing their username as a safety check.
   */
  deleteAccount: protectedProcedure
    .input(
      z.object({
        confirmUsername: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Safety: confirm the username matches
      if (input.confirmUsername !== ctx.user.username) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Username does not match. Please type your username exactly to confirm.',
        });
      }

      // Guard: check for active contracts. Each entry is typed against
      // the contract_status enum so Drizzle's `inArray` doesn't widen to
      // generic string[].
      type ActiveStatus = (typeof contracts.status.enumValues)[number];
      const ACTIVE_STATUSES: ActiveStatus[] = [
        'funded',
        'in_progress',
        'submitted',
        'revision_requested',
      ];
      const activeContracts = await ctx.db.query.contracts.findMany({
        where: and(
          or(eq(contracts.clientId, ctx.user.id), eq(contracts.freelancerId, ctx.user.id)),
          inArray(contracts.status, ACTIVE_STATUSES),
        ),
        columns: { id: true, status: true },
        limit: 5,
      });

      if (activeContracts.length > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `You have ${activeContracts.length} active contract(s). Complete or cancel them before deleting your account.`,
        });
      }

      // Anonymise + soft-delete. We mutate `privyId` to a tombstone so a
      // future signup (with a brand-new Privy session) doesn't collide on
      // the unique index — the old privyId reference is preserved inside
      // the tombstone string for forensics.
      //
      // Username is also nulled so a future user can re-claim it. We
      // can't FK-constraint that, but `users_username_idx` is a unique
      // index over a NULL-able column so multiple deleted rows with NULL
      // username coexist fine.
      const tombstonePrivyId = `deleted:${ctx.user.privyId}:${Date.now()}`;
      await ctx.db
        .update(users)
        .set({
          privyId: tombstonePrivyId,
          username: null,
          displayName: 'Deleted User',
          email: null,
          bio: null,
          avatarUrl: null,
          skills: [],
          hourlyRate: null,
          country: null,
          timezone: null,
          portfolioIpfsHash: null,
          notificationPreferences: null,
          deletedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),
});
