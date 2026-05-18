import { TRPCError } from '@trpc/server';
import { DEFAULT_FEE_BPS } from '@forj/contracts';
import { and, contracts, desc, eq, jobs, ne, proposals, sql, users } from '@forj/db';
import { z } from 'zod';
import { isAllowedFileUrl } from '../lib/file-host';
import { checkRateLimit, RATE_LIMITS } from '../middleware/rate-limit';
import { notify } from '../services/notifications';
import {
  createTRPCRouter,
  freelancerProcedure,
  protectedProcedure,
} from '../trpc';

/** Approved-host upload URL — shared whitelist with job + service routers. */
const fileUrl = z
  .string()
  .url()
  .refine(isAllowedFileUrl, 'URL must point to UploadThing or Pinata.');

const milestoneSchema = z.object({
  title: z.string().max(120),
  amount: z.number().positive(),
  duration: z.string().max(80),
  description: z.string().max(500),
});

export const proposalRouter = createTRPCRouter({
  listByJob: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
        columns: { clientId: true },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND' });
      if (job.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the job owner can view proposals' });
      }
      return ctx.db.query.proposals.findMany({
        where: eq(proposals.jobId, input.jobId),
        orderBy: [desc(proposals.createdAt)],
        with: {
          freelancer: {
            columns: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              workScore: true,
              badgeTier: true,
              totalJobsCompleted: true,
            },
          },
        },
      });
    }),

  myProposals: freelancerProcedure.query(async ({ ctx }) => {
    return ctx.db.query.proposals.findMany({
      where: eq(proposals.freelancerId, ctx.user.id),
      orderBy: [desc(proposals.createdAt)],
      with: {
        job: {
          columns: {
            id: true,
            title: true,
            slug: true,
            status: true,
            budgetMin: true,
            budgetMax: true,
          },
        },
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const proposal = await ctx.db.query.proposals.findFirst({
        where: eq(proposals.id, input.id),
        with: {
          job: true,
          freelancer: true,
        },
      });
      if (!proposal) throw new TRPCError({ code: 'NOT_FOUND' });

      const isFreelancer = proposal.freelancerId === ctx.user.id;
      const isClient = proposal.job.clientId === ctx.user.id;
      if (!isFreelancer && !isClient) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return proposal;
    }),

  create: freelancerProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        coverLetter: z.string().min(50).max(5000),
        bidAmount: z.number().positive(),
        bidType: z.enum(['fixed', 'hourly']),
        estimatedDuration: z.string().min(1).max(80),
        milestones: z.array(milestoneSchema).max(10).optional(),
        attachments: z.array(fileUrl).max(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(ctx.user.id, 'proposalCreate', RATE_LIMITS.proposalCreate);

      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
        columns: { id: true, clientId: true, status: true, title: true },
      });
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      if (job.status !== 'open') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Job is not accepting proposals' });
      }
      if (job.clientId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot propose on your own job' });
      }

      const [proposal] = await ctx.db
        .insert(proposals)
        .values({
          jobId: input.jobId,
          freelancerId: ctx.user.id,
          coverLetter: input.coverLetter,
          bidAmount: input.bidAmount.toString(),
          bidType: input.bidType,
          estimatedDuration: input.estimatedDuration,
          milestones: input.milestones,
          attachments: input.attachments ?? [],
        })
        .returning();

      await ctx.db
        .update(jobs)
        .set({ proposalCount: sql`${jobs.proposalCount} + 1` })
        .where(eq(jobs.id, input.jobId));

      // Notify the client that a new proposal rolled in.
      const freelancerName = ctx.user.displayName ?? ctx.user.username ?? 'A freelancer';
      await notify({
        userId: job.clientId,
        actorId: ctx.user.id,
        type: 'proposal_received',
        title: 'New proposal received',
        body: `${freelancerName} submitted a proposal for "${job.title}".`,
        entityType: 'proposal',
        entityId: proposal!.id,
        actionUrl: `/dashboard/jobs/${input.jobId}`,
        metadata: {
          bidAmount: input.bidAmount,
          bidType: input.bidType,
          jobTitle: job.title,
          jobId: input.jobId,
          freelancerName,
        },
      });

      return proposal;
    }),

  withdraw: freelancerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.query.proposals.findFirst({
        where: and(eq(proposals.id, input.id), eq(proposals.freelancerId, ctx.user.id)),
      });
      if (!proposal) throw new TRPCError({ code: 'NOT_FOUND' });
      if (proposal.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only pending proposals can be withdrawn' });
      }
      await ctx.db
        .update(proposals)
        .set({ status: 'withdrawn' })
        .where(eq(proposals.id, input.id));
      return { success: true };
    }),

  /**
   * Client accepts a freelancer proposal.
   * This creates an UNFUNDED contract record (status='created'). Escrow funding
   * happens later via the on-chain flow in Phase 3. All other pending proposals
   * on the same job are auto-rejected and the job is locked to 'in_progress'.
   */
  accept: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.query.proposals.findFirst({
        where: eq(proposals.id, input.id),
        with: {
          job: true,
          // Need the freelancer's wallet + deletedAt to gate the
          // accept BEFORE we lock the job — otherwise the client
          // gets stuck with a contract they can't fund because the
          // freelancer never set up a wallet or has since deleted
          // their account. Surfacing this at accept time is much
          // better UX than at fundEscrow time (audit finding HIGH).
          freelancer: {
            columns: { id: true, walletAddress: true, deletedAt: true },
          },
        },
      });
      if (!proposal) throw new TRPCError({ code: 'NOT_FOUND' });
      if (proposal.job.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the job owner can accept proposals' });
      }
      if (proposal.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Proposal is not pending' });
      }
      if (proposal.job.status !== 'open') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Job is not accepting proposals anymore' });
      }
      // Freelancer must be a live account with a wallet — escrow
      // funding requires a wallet to release TO. Catching this at
      // accept time means the client never lands on a contract
      // detail page asking "why can't I fund this?".
      if (proposal.freelancer.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This freelancer has deleted their account. The proposal cannot be accepted.',
        });
      }
      if (!proposal.freelancer.walletAddress) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            "This freelancer hasn't set up a wallet yet. They need to complete their wallet setup before you can fund an escrow.",
        });
      }

      // Contract financials. Single source of truth: `DEFAULT_FEE_BPS` from
      // `@forj/contracts` — same constant the on-chain registry was
      // deployed with. Storing the off-chain platformFee as a different rate
      // would cause user-visible drift between "what we said you'd get" and
      // "what the contract actually paid out".
      const total = Number(proposal.bidAmount);
      const feeRate = DEFAULT_FEE_BPS / 10_000; // 250 bps → 0.025
      const platformFee = Math.round(total * feeRate * 100) / 100;
      const freelancerAmount = Math.round((total - platformFee) * 100) / 100;
      // Delivery deadline: derived from estimatedDuration not trivial; default to 30 days
      // for now. The client can re-negotiate before funding the escrow.
      const deliveryDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Copy proposal milestones → contract milestones with initial status.
      // The proposal stores the freelancer's *plan*; the contract stores the
      // *current state* of execution. Off-chain only for now (Phase 7A) —
      // the on-chain escrow still funds the total in one shot. Marking a
      // milestone "released" at the DB level just unlocks the next one
      // visually; actual money moves once at `approveWork` time.
      const milestonesPlan = proposal.milestones ?? null;
      const initialMilestones = milestonesPlan
        ? milestonesPlan.map((m, i) => ({
            title: m.title,
            amount: m.amount,
            duration: m.duration,
            description: m.description,
            status: (i === 0 ? 'in_progress' : 'pending') as
              | 'pending'
              | 'in_progress'
              | 'submitted'
              | 'approved',
          }))
        : null;

      // Steps 1-4 run inside a single Postgres transaction. Now that
      // we're on `drizzle-orm/neon-serverless` (WebSocket pool, full
      // pg protocol), this is real atomicity — either every step
      // commits or none does. Previously, on the HTTP driver, we had
      // to fake atomicity with a "best-effort rollback on failure"
      // pattern that could leave the job in_progress with no
      // accepted proposal if the rollback UPDATE itself failed.
      //
      // The transaction wraps:
      //   1. Job lock (open → in_progress)
      //   2. Proposal status (pending → accepted)
      //   3. Contract row insert
      //   4. Reject every other pending proposal on this job
      //
      // Notifications stay OUTSIDE the transaction — they're best-
      // effort and shouldn't be able to roll back a successful
      // contract creation if Resend / Inngest hiccup.
      const contract = await ctx.db.transaction(async (tx) => {
        // 1. Lock the job FIRST via a conditional UPDATE. If two
        //    clients click "accept" on different proposals at almost
        //    the same moment, only one UPDATE flips the job from
        //    'open' → 'in_progress'; the other returns zero rows
        //    and we throw (which auto-rolls the tx).
        const lockedJobs = await tx
          .update(jobs)
          .set({ status: 'in_progress' })
          .where(and(eq(jobs.id, proposal.jobId), eq(jobs.status, 'open')))
          .returning({ id: jobs.id });
        if (lockedJobs.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Another proposal was just accepted on this job. Refresh to see the current state.',
          });
        }

        // 2. Same optimistic lock on the proposal itself — if it
        //    was accepted/withdrawn/rejected in between our findFirst
        //    and now, throw + roll back.
        const acceptedProposals = await tx
          .update(proposals)
          .set({ status: 'accepted' })
          .where(and(eq(proposals.id, input.id), eq(proposals.status, 'pending')))
          .returning({ id: proposals.id });
        if (acceptedProposals.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This proposal was just modified by someone else. Refresh and try again.',
          });
        }

        // 3. Create the unfunded contract.
        const [created] = await tx
          .insert(contracts)
          .values({
            jobId: proposal.jobId,
            clientId: proposal.job.clientId,
            freelancerId: proposal.freelancerId,
            proposalId: proposal.id,
            title: proposal.job.title,
            totalAmount: total.toString(),
            platformFee: platformFee.toString(),
            freelancerAmount: freelancerAmount.toString(),
            paymentMethod: 'crypto',
            deliveryDeadline,
            milestones: initialMilestones,
            currentMilestone: 0,
          })
          .returning();
        if (!created) {
          // Drizzle returns the inserted row; an empty result is
          // a driver-level bug, not a business condition. Throw to
          // roll back rather than continue with `undefined`.
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Contract insert returned no row',
          });
        }

        // 4. Reject all OTHER still-pending proposals on this job.
        //    Inside the tx so a job with one accepted proposal can
        //    never coexist with stale 'pending' siblings.
        await tx
          .update(proposals)
          .set({ status: 'rejected' })
          .where(
            and(
              eq(proposals.jobId, proposal.jobId),
              ne(proposals.id, input.id),
              eq(proposals.status, 'pending'),
            ),
          );

        return created;
      });

      // 5. Notify the accepted freelancer + fire rejection notifications for the
      //    losing bidders. Best-effort — we run them in parallel after the
      //    critical path has committed.
      const clientName = ctx.user.displayName ?? ctx.user.username ?? 'The client';
      const jobTitle = proposal.job.title;

      // Fetch the other still-pending proposals we rejected, so we can notify them.
      const rejectedBidders = await ctx.db.query.proposals.findMany({
        where: and(
          eq(proposals.jobId, proposal.jobId),
          ne(proposals.id, input.id),
          eq(proposals.status, 'rejected'),
        ),
        columns: { id: true, freelancerId: true },
      });

      await Promise.all([
        notify({
          userId: proposal.freelancerId,
          actorId: ctx.user.id,
          type: 'proposal_accepted',
          title: 'Your proposal was accepted',
          body: `${clientName} accepted your proposal for "${jobTitle}". A contract has been created.`,
          entityType: 'proposal',
          entityId: proposal.id,
          actionUrl: `/dashboard/proposals/${proposal.id}`,
          metadata: { contractId: contract.id, jobTitle },
        }),
        ...rejectedBidders.map((r) =>
          notify({
            userId: r.freelancerId,
            actorId: ctx.user.id,
            type: 'proposal_rejected',
            title: 'Proposal not selected',
            body: `The client chose another freelancer for "${jobTitle}".`,
            entityType: 'proposal',
            entityId: r.id,
            actionUrl: `/dashboard/proposals/${r.id}`,
            metadata: { jobTitle },
          }),
        ),
      ]);

      return contract;
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.query.proposals.findFirst({
        where: eq(proposals.id, input.id),
        with: { job: { columns: { clientId: true, title: true } } },
      });
      if (!proposal) throw new TRPCError({ code: 'NOT_FOUND' });
      if (proposal.job.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the job owner can reject proposals' });
      }
      if (proposal.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only pending proposals can be rejected' });
      }
      await ctx.db
        .update(proposals)
        .set({ status: 'rejected' })
        .where(eq(proposals.id, input.id));

      await notify({
        userId: proposal.freelancerId,
        actorId: ctx.user.id,
        type: 'proposal_rejected',
        title: 'Proposal not selected',
        body: `The client declined your proposal for "${proposal.job.title}".`,
        entityType: 'proposal',
        entityId: proposal.id,
        actionUrl: `/dashboard/proposals/${proposal.id}`,
        metadata: { jobTitle: proposal.job.title },
      });

      return { success: true };
    }),
});
