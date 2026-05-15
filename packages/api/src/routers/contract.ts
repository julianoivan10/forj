import { TRPCError } from '@trpc/server';
import { and, contracts, desc, eq, inArray, jobs, or, reviews, sql, users } from '@forj/db';
import { z } from 'zod';
import {
  EscrowVerificationError,
  dollarsToUsdcUnits,
  verifyEscrowFunding,
  verifyEscrowRelease,
} from '../services/escrow';
import { notify } from '../services/notifications';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

/**
 * Auto-release window after a successful submission, in days.
 * If the client neither approves nor requests revision before this window,
 * the contract is considered approved (will be wired to on-chain release in 3C).
 */
const AUTO_RELEASE_DAYS = 7;

const submitWorkInput = z.object({
  contractId: z.string().uuid(),
  message: z.string().min(10).max(5000),
  files: z.array(z.string().url()).max(10).optional(),
});

const requestRevisionInput = z.object({
  contractId: z.string().uuid(),
  reason: z.string().min(10).max(2000),
});

const cancelInput = z.object({
  contractId: z.string().uuid(),
  reason: z.string().min(10).max(2000),
});

const disputeInput = z.object({
  contractId: z.string().uuid(),
  reason: z.string().min(20).max(3000),
});

/**
 * Hex address regex used to keep loosely-typed strings from the frontend
 * out of viem before it has a chance to throw cryptic errors.
 */
const hex0x = /^0x[a-fA-F0-9]{40}$/;
const txHashRe = /^0x[a-fA-F0-9]{64}$/;

const fundInput = z.discriminatedUnion('paymentMethod', [
  // Crypto path — the only path Phase 3C cares about. Everything is
  // required because the backend must verify the on-chain tx before flipping
  // the contract row to `funded`.
  z.object({
    paymentMethod: z.literal('crypto'),
    contractId: z.string().uuid(),
    txHash: z.string().regex(txHashRe, 'Invalid tx hash'),
    onChainContractId: z
      .union([z.bigint(), z.number().int().positive(), z.string().regex(/^\d+$/)])
      .transform((v) => (typeof v === 'bigint' ? v : BigInt(v))),
    chainId: z.number().int().positive(),
  }),
  // Off-chain / fiat path — kept for backward compat. Same behaviour as
  // Phase 3A: just flips the status without any verification.
  z.object({
    paymentMethod: z.literal('fiat'),
    contractId: z.string().uuid(),
    txHash: z.string().min(4).max(120).optional(),
  }),
]);

const approveWorkInput = z.discriminatedUnion('paymentMethod', [
  z.object({
    paymentMethod: z.literal('crypto'),
    contractId: z.string().uuid(),
    txHash: z.string().regex(txHashRe, 'Invalid tx hash'),
    chainId: z.number().int().positive(),
  }),
  z.object({
    paymentMethod: z.literal('fiat'),
    contractId: z.string().uuid(),
  }),
]);

const partyName = (u: { displayName?: string | null; username?: string | null }) =>
  u.displayName ?? u.username ?? 'A user';

export const contractRouter = createTRPCRouter({
  /**
   * Lists every contract this user is a party to (as client OR freelancer).
   */
  myContracts: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.contracts.findMany({
      where: or(
        eq(contracts.clientId, ctx.user.id),
        eq(contracts.freelancerId, ctx.user.id),
      ),
      orderBy: [desc(contracts.createdAt)],
      with: {
        job: { columns: { id: true, title: true, slug: true } },
        client: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
        freelancer: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  }),

  /**
   * Public, no-auth-required proof of a completed contract.
   *
   * This is the freelancer's killer portfolio link: anyone (a future client,
   * a recruiter, a follower on Twitter) can hit `/proof/<id>` and see — with
   * cryptographic backing — that real work was paid for via real on-chain
   * settlement. The page links every claim straight to Basescan so trust
   * doesn't require trusting WorkChain at all.
   *
   * Visibility rules:
   *   - Only contracts in `completed` status are exposed (work + payment done).
   *   - `disputed` and earlier states are hidden — disputes are private.
   *   - Reviews are filtered to `isPublic = true` only.
   *
   * Anything that could leak a non-public detail (private review bodies,
   * dispute reasons, internal IDs beyond the contract id, etc) is omitted.
   */
  publicProof: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.id),
        columns: {
          id: true,
          title: true,
          totalAmount: true,
          freelancerAmount: true,
          platformFee: true,
          currency: true,
          status: true,
          escrowTxHash: true,
          releaseTxHash: true,
          escrowContractAddress: true,
          onChainContractId: true,
          fundedAt: true,
          submittedAt: true,
          completedAt: true,
          createdAt: true,
        },
        with: {
          client: {
            columns: { id: true, username: true, displayName: true, avatarUrl: true },
          },
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
          job: {
            columns: { id: true, title: true, slug: true, category: true },
          },
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.status !== 'completed') {
        // Not 404 — the contract exists, but isn't proof-ready. We surface
        // a typed reason so the page can render a friendly "not yet" state.
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Proof is only available for completed contracts',
        });
      }

      // Fetch public reviews on this contract — both directions matter
      // (client→freelancer is most common, but freelancer→client also
      // belongs in the proof story).
      const publicReviews = await ctx.db.query.reviews.findMany({
        where: and(eq(reviews.contractId, contract.id), eq(reviews.isPublic, true)),
        orderBy: [desc(reviews.createdAt)],
        with: {
          reviewer: {
            columns: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      return {
        contract,
        reviews: publicReviews,
      };
    }),

  /**
   * Client-side editor for the contract terms BEFORE escrow funding.
   *
   * Once funded, terms are baked into the on-chain Escrow struct and can't
   * be retroactively edited (it would invalidate the chain's `deliveryDeadline`
   * field). This proc only allows edits while status is still `created`.
   *
   * Currently exposes deadline only — totalAmount is sourced from the
   * accepted proposal's bid and shouldn't drift. If we later want
   * renegotiation pre-funding, that lives here.
   */
  updateTerms: protectedProcedure
    .input(
      z.object({
        contractId: z.string().uuid(),
        deliveryDeadline: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        columns: { id: true, clientId: true, status: true },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.clientId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the client can edit the contract terms',
        });
      }
      if (contract.status !== 'created') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Terms can only be edited before escrow is funded',
        });
      }
      // Deadline must be in the future. The chain enforces the same on
      // `fund()` so let's catch it client-side too.
      if (input.deliveryDeadline.getTime() <= Date.now()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Delivery deadline must be in the future',
        });
      }
      // And not absurdly far out — a year cap matches `MAX_AUTO_RELEASE_WINDOW`
      // mental model and protects against fat-fingered date inputs.
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      if (input.deliveryDeadline.getTime() > Date.now() + oneYear) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Delivery deadline must be within one year',
        });
      }

      const [updated] = await ctx.db
        .update(contracts)
        .set({ deliveryDeadline: input.deliveryDeadline })
        .where(eq(contracts.id, contract.id))
        .returning();

      return updated;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.id),
        with: {
          job: true,
          client: true,
          freelancer: true,
          proposal: true,
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });

      const isParty =
        contract.clientId === ctx.user.id || contract.freelancerId === ctx.user.id;
      if (!isParty) throw new TRPCError({ code: 'FORBIDDEN' });
      return contract;
    }),

  /**
   * Client funds the escrow.
   *
   * Two paths:
   *  - **crypto**: caller supplies `txHash` + `onChainContractId` + `chainId`
   *    after their wallet signed `WorkChainEscrow.fund()`. The backend pulls
   *    the receipt, decodes the `EscrowFunded` event, and bails if anything
   *    doesn't match. Only then does the DB row flip to `in_progress`.
   *  - **fiat**: legacy off-chain path (Phase 3A). No verification, just a
   *    state transition. Kept so non-Web3 demos still work end-to-end.
   *
   * The crypto path is the one Phase 3C is built around; future contracts
   * will default to crypto once the on-chain UX is GA'd.
   */
  fundEscrow: protectedProcedure
    .input(fundInput)
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        with: {
          freelancer: {
            columns: { id: true, username: true, displayName: true, walletAddress: true },
          },
          client: { columns: { id: true, walletAddress: true } },
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the client can fund this contract' });
      }
      if (contract.status !== 'created') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot fund a contract that is already ${contract.status}`,
        });
      }

      const now = new Date();
      let escrowTxHash: string | null = null;
      let onChainContractId: number | null = null;
      let escrowContractAddress: string | null = null;

      if (input.paymentMethod === 'crypto') {
        const clientWallet = contract.client.walletAddress;
        const freelancerWallet = contract.freelancer.walletAddress;
        if (!clientWallet || !hex0x.test(clientWallet)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Client wallet address missing — connect a wallet before funding',
          });
        }
        if (!freelancerWallet || !hex0x.test(freelancerWallet)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Freelancer has no wallet on file — they need one to receive USDC',
          });
        }

        try {
          const expectedAmount = dollarsToUsdcUnits(contract.totalAmount);
          const verified = await verifyEscrowFunding({
            chainId: input.chainId,
            txHash: input.txHash as `0x${string}`,
            expected: {
              client: clientWallet as `0x${string}`,
              freelancer: freelancerWallet as `0x${string}`,
              amount: expectedAmount,
            },
          });

          // Cross-check escrowId emitted by the chain matches what the
          // frontend echoed back. Catches a class of bugs where the wallet
          // signs one tx but UI reports a different id.
          if (verified.escrowId !== input.onChainContractId) {
            throw new EscrowVerificationError(
              'event_mismatch',
              `On-chain escrowId=${verified.escrowId} but client claimed ${input.onChainContractId}`,
            );
          }

          escrowTxHash = input.txHash;
          // `onChainContractId` is `integer` in the DB. uint256 is wider but
          // in practice the registry counter won't exceed JS_MAX_SAFE_INTEGER
          // for many years; gate at 2^31-1 anyway to fit the column.
          if (verified.escrowId > BigInt(2_147_483_647)) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Escrow id overflowed the off-chain integer column',
            });
          }
          onChainContractId = Number(verified.escrowId);
          // Read at request time so a registry redeploy is picked up
          // automatically on the next call.
          const { getAddresses } = await import('@forj/contracts');
          escrowContractAddress = getAddresses(input.chainId).escrow || null;
        } catch (err) {
          if (err instanceof EscrowVerificationError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
          }
          throw err;
        }
      } else if (input.txHash) {
        // Fiat path can still record an off-chain reference (Stripe charge id
        // etc) for audit. No verification.
        escrowTxHash = input.txHash;
      }

      const [updated] = await ctx.db
        .update(contracts)
        .set({
          status: 'in_progress',
          fundedAt: now,
          escrowTxHash,
          onChainContractId,
          escrowContractAddress,
        })
        .where(eq(contracts.id, contract.id))
        .returning();

      const clientName = partyName(ctx.user);
      await notify({
        userId: contract.freelancerId,
        actorId: ctx.user.id,
        type: 'contract_funded',
        title: 'Escrow funded — start working',
        body: `${clientName} funded the escrow for "${contract.title}". You can begin the work.`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: {
          contractTitle: contract.title,
          txHash: escrowTxHash,
          onChainContractId,
          paymentMethod: input.paymentMethod,
          amount: contract.totalAmount,
        },
      });

      return updated;
    }),

  /**
   * Freelancer submits the deliverable.
   * Pushes status -> 'submitted' and starts the auto-release countdown.
   * Allowed from in_progress (post-funding) or revision_requested.
   */
  submitWork: protectedProcedure
    .input(submitWorkInput)
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.freelancerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the freelancer can submit work' });
      }
      if (contract.status !== 'in_progress' && contract.status !== 'revision_requested') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Submission is only allowed when the contract is in progress',
        });
      }

      const now = new Date();
      const autoReleaseAt = new Date(now.getTime() + AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000);

      // Optimistic concurrency: only flip status when it's still in one of
      // the expected states. If a parallel submit sneaks past the read
      // above, the second UPDATE returns zero rows and we abort instead of
      // resetting `autoReleaseAt` (which would extend the review window
      // unfairly).
      type SubmitFromStatus = 'in_progress' | 'revision_requested';
      const submitFromStatuses: SubmitFromStatus[] = ['in_progress', 'revision_requested'];
      const updatedRows = await ctx.db
        .update(contracts)
        .set({
          status: 'submitted',
          submissionMessage: input.message,
          submissionFiles: input.files ?? [],
          submittedAt: now,
          autoReleaseAt,
        })
        .where(
          and(
            eq(contracts.id, contract.id),
            inArray(contracts.status, submitFromStatuses),
          ),
        )
        .returning();
      const updated = updatedRows[0];
      if (!updated) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Contract state changed while submitting. Refresh and try again.',
        });
      }

      const freelancerName = partyName(ctx.user);
      await notify({
        userId: contract.clientId,
        actorId: ctx.user.id,
        type: 'contract_submitted',
        title: 'Work submitted for review',
        body: `${freelancerName} submitted work for "${contract.title}". Review and approve within ${AUTO_RELEASE_DAYS} days.`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: {
          contractTitle: contract.title,
          autoReleaseAt: autoReleaseAt.toISOString(),
          freelancerName,
        },
      });

      return updated;
    }),

  /**
   * Client approves the submission. Two paths:
   *  - **crypto**: caller supplies `txHash` from `WorkChainEscrow.release()`.
   *    Backend verifies `Released` event, records `releaseTxHash`, and
   *    flips status. Without a verified release tx the DB never records the
   *    contract as completed — this prevents an attacker from marking
   *    contracts complete without actually paying out.
   *  - **fiat**: same as 3A — just a status flip + counter bump.
   */
  approveWork: protectedProcedure
    .input(approveWorkInput)
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        with: {
          freelancer: { columns: { id: true, walletAddress: true } },
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the client can approve this contract' });
      }
      if (contract.status !== 'submitted') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Approval is only allowed after the freelancer submits work',
        });
      }

      let releaseTxHash: string | null = null;

      if (input.paymentMethod === 'crypto') {
        if (contract.onChainContractId == null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Contract has no on-chain escrowId — was it funded as crypto?',
          });
        }
        const freelancerWallet = contract.freelancer.walletAddress;
        if (!freelancerWallet || !hex0x.test(freelancerWallet)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Freelancer wallet missing — release would have nowhere to land',
          });
        }
        try {
          await verifyEscrowRelease({
            chainId: input.chainId,
            txHash: input.txHash as `0x${string}`,
            expected: {
              escrowId: BigInt(contract.onChainContractId),
              freelancer: freelancerWallet as `0x${string}`,
            },
          });
          releaseTxHash = input.txHash;
        } catch (err) {
          if (err instanceof EscrowVerificationError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
          }
          throw err;
        }
      }

      const now = new Date();
      const [updated] = await ctx.db
        .update(contracts)
        .set({
          status: 'completed',
          completedAt: now,
          releaseTxHash,
        })
        .where(eq(contracts.id, contract.id))
        .returning();

      // Bump freelancer counters + close the underlying job.
      await Promise.all([
        ctx.db
          .update(users)
          .set({
            totalJobsCompleted: sql`${users.totalJobsCompleted} + 1`,
            totalEarned: sql`${users.totalEarned} + ${contract.freelancerAmount}`,
          })
          .where(eq(users.id, contract.freelancerId)),
        ctx.db
          .update(jobs)
          .set({ status: 'completed' })
          .where(eq(jobs.id, contract.jobId)),
      ]);

      const clientName = partyName(ctx.user);
      await notify({
        userId: contract.freelancerId,
        actorId: ctx.user.id,
        type: 'contract_completed',
        title: 'Work approved — payment released',
        body: `${clientName} approved your work on "${contract.title}". Funds have been released.`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: {
          contractTitle: contract.title,
          freelancerAmount: contract.freelancerAmount,
          releaseTxHash,
        },
      });

      return updated;
    }),

  /**
   * Mark a milestone submitted (freelancer-only, off-chain).
   *
   * Milestones in Phase 7A are an off-chain progress tracker — money still
   * moves once at `approveWork` time. This proc updates the milestones
   * JSONB so the UI reflects "milestone N delivered, awaiting client
   * approval" and the client gets a notification per milestone instead of
   * one giant submission at the end.
   */
  markMilestoneSubmitted: protectedProcedure
    .input(
      z.object({
        contractId: z.string().uuid(),
        milestoneIndex: z.number().int().min(0).max(20),
        message: z.string().min(10).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        columns: {
          id: true,
          freelancerId: true,
          clientId: true,
          status: true,
          milestones: true,
          currentMilestone: true,
          title: true,
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.freelancerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      // Only allow during active work — once the contract is fully approved
      // or off-track (cancelled/disputed), milestone editing is locked.
      if (
        contract.status !== 'in_progress' &&
        contract.status !== 'submitted' &&
        contract.status !== 'revision_requested' &&
        contract.status !== 'funded'
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Milestones can't be updated in ${contract.status} state`,
        });
      }
      if (!contract.milestones?.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This contract has no milestones',
        });
      }
      if (
        input.milestoneIndex < 0 ||
        input.milestoneIndex >= contract.milestones.length
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Milestone index out of range' });
      }

      // Update target milestone → submitted. Freeze sequential ordering:
      // freelancer must submit milestones in order to keep the timeline
      // legible. We don't enforce the "current" pointer though, since the
      // client may approve out of order in some flows.
      const next = contract.milestones.map((m, i) =>
        i === input.milestoneIndex ? { ...m, status: 'submitted' as const } : m,
      );

      const [updated] = await ctx.db
        .update(contracts)
        .set({ milestones: next })
        .where(eq(contracts.id, contract.id))
        .returning();

      const freelancerName = partyName(ctx.user);
      await notify({
        userId: contract.clientId,
        actorId: ctx.user.id,
        type: 'contract_submitted',
        title: `Milestone ${input.milestoneIndex + 1} submitted`,
        body: `${freelancerName} submitted "${contract.milestones[input.milestoneIndex]?.title}" on "${contract.title}".`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: {
          contractTitle: contract.title,
          milestoneIndex: input.milestoneIndex,
          milestoneNote: input.message,
        },
      });

      return updated;
    }),

  /**
   * Approve a single milestone off-chain (client-only).
   *
   * Same caveat as `markMilestoneSubmitted` — this is a status flip in
   * the JSONB, NOT an on-chain release. It moves the visual progress
   * forward and bumps `currentMilestone` to the next pending one.
   * The actual payout still happens at `approveWork` (release of the
   * full escrow) once all milestones are approved.
   */
  approveMilestoneOffchain: protectedProcedure
    .input(
      z.object({
        contractId: z.string().uuid(),
        milestoneIndex: z.number().int().min(0).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        columns: {
          id: true,
          clientId: true,
          freelancerId: true,
          status: true,
          milestones: true,
          currentMilestone: true,
          title: true,
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (!contract.milestones?.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This contract has no milestones',
        });
      }
      const target = contract.milestones[input.milestoneIndex];
      if (!target) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Milestone index out of range' });
      }
      if (target.status !== 'submitted') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Milestone must be submitted before approval',
        });
      }

      // Mark approved + advance the next pending one to in_progress.
      const next = contract.milestones.map((m, i) => {
        if (i === input.milestoneIndex) return { ...m, status: 'approved' as const };
        return m;
      });
      // Find the next pending → bump it to in_progress.
      const nextPendingIdx = next.findIndex((m) => m.status === 'pending');
      if (nextPendingIdx >= 0) {
        next[nextPendingIdx] = { ...next[nextPendingIdx]!, status: 'in_progress' };
      }
      const newCurrent =
        nextPendingIdx >= 0 ? nextPendingIdx : input.milestoneIndex;

      const [updated] = await ctx.db
        .update(contracts)
        .set({ milestones: next, currentMilestone: newCurrent })
        .where(eq(contracts.id, contract.id))
        .returning();

      const clientName = partyName(ctx.user);
      await notify({
        userId: contract.freelancerId,
        actorId: ctx.user.id,
        type: 'contract_funded', // closest existing event; reuse for now
        title: `Milestone ${input.milestoneIndex + 1} approved`,
        body: `${clientName} approved "${target.title}". Continue with the next milestone.`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: {
          contractTitle: contract.title,
          milestoneIndex: input.milestoneIndex,
        },
      });

      return updated;
    }),

  /**
   * Permissionless claim after the auto-release window.
   *
   * Freelancer (or anyone) calls `WorkChainEscrow.claimAfterTimeout()` once
   * `autoReleaseAt` has passed. The contract emits `Released` exactly like
   * a normal release, so we re-use the same verifier. The DB ends up in the
   * same `completed` state — only difference is which wallet paid the gas.
   *
   * Authority on the off-chain side: only the freelancer can call this proc.
   * It would be safe to allow anyone (the on-chain check already enforces
   * the timeout), but locking it down keeps the audit trail clean.
   */
  claimRelease: protectedProcedure
    .input(
      z.object({
        contractId: z.string().uuid(),
        txHash: z.string().regex(txHashRe, 'Invalid tx hash'),
        chainId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        with: {
          freelancer: { columns: { id: true, walletAddress: true } },
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.freelancerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the freelancer can claim a timed-out escrow',
        });
      }
      if (contract.status !== 'submitted') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Claim is only available on submitted contracts whose review window has passed',
        });
      }
      if (contract.onChainContractId == null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Off-chain contract has no escrowId — claim only applies to crypto contracts',
        });
      }
      // Sanity-check the off-chain timer matches what's on-chain. The chain
      // is authoritative — if our DB thinks the window is open but the chain
      // disagrees, the verifier call below will fail anyway. We still emit
      // an upfront friendly message in the common case.
      if (contract.autoReleaseAt && contract.autoReleaseAt.getTime() > Date.now()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Auto-release window has not yet expired',
        });
      }

      const freelancerWallet = contract.freelancer.walletAddress;
      if (!freelancerWallet || !hex0x.test(freelancerWallet)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Freelancer wallet missing — claim would have nowhere to land',
        });
      }

      try {
        await verifyEscrowRelease({
          chainId: input.chainId,
          txHash: input.txHash as `0x${string}`,
          expected: {
            escrowId: BigInt(contract.onChainContractId),
            freelancer: freelancerWallet as `0x${string}`,
          },
        });
      } catch (err) {
        if (err instanceof EscrowVerificationError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
        }
        throw err;
      }

      const now = new Date();
      const [updated] = await ctx.db
        .update(contracts)
        .set({
          status: 'completed',
          completedAt: now,
          releaseTxHash: input.txHash,
        })
        .where(eq(contracts.id, contract.id))
        .returning();

      await Promise.all([
        ctx.db
          .update(users)
          .set({
            totalJobsCompleted: sql`${users.totalJobsCompleted} + 1`,
            totalEarned: sql`${users.totalEarned} + ${contract.freelancerAmount}`,
          })
          .where(eq(users.id, contract.freelancerId)),
        ctx.db
          .update(jobs)
          .set({ status: 'completed' })
          .where(eq(jobs.id, contract.jobId)),
      ]);

      // Notify the *client* in this case — they should know the funds
      // released without their action so they're not surprised.
      await notify({
        userId: contract.clientId,
        actorId: ctx.user.id,
        type: 'contract_completed',
        title: 'Auto-release: funds paid to freelancer',
        body: `The review window for "${contract.title}" has passed and the freelancer claimed the funds.`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: {
          contractTitle: contract.title,
          releaseTxHash: input.txHash,
          autoReleased: true,
        },
      });

      return updated;
    }),

  /**
   * Client rejects the submission and asks for changes. Status reverts to
   * 'revision_requested' so the freelancer can resubmit.
   */
  requestRevision: protectedProcedure
    .input(requestRevisionInput)
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the client can request revisions' });
      }
      if (contract.status !== 'submitted') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Revisions can only be requested after a submission',
        });
      }

      const [updated] = await ctx.db
        .update(contracts)
        .set({
          status: 'revision_requested',
          revisionReason: input.reason,
          revisionCount: sql`${contracts.revisionCount} + 1`,
          autoReleaseAt: null,
        })
        .where(eq(contracts.id, contract.id))
        .returning();

      const clientName = partyName(ctx.user);
      await notify({
        userId: contract.freelancerId,
        actorId: ctx.user.id,
        type: 'contract_revision_requested',
        title: 'Revision requested',
        body: `${clientName} requested changes on "${contract.title}".`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: { contractTitle: contract.title, reason: input.reason },
      });

      return updated;
    }),

  /**
   * Mutual cancel — allowed from 'created' (no escrow yet) by either side.
   * Once funded, parties must use raiseDispute instead so the escrow can be
   * resolved by an arbiter (Phase 3C).
   */
  cancelContract: protectedProcedure
    .input(cancelInput)
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      const isParty =
        contract.clientId === ctx.user.id || contract.freelancerId === ctx.user.id;
      if (!isParty) throw new TRPCError({ code: 'FORBIDDEN' });
      if (contract.status !== 'created') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Funded contracts must be disputed instead of cancelled',
        });
      }

      const now = new Date();
      const [updated] = await ctx.db
        .update(contracts)
        .set({
          status: 'cancelled',
          cancellationReason: input.reason,
          cancelledAt: now,
        })
        .where(eq(contracts.id, contract.id))
        .returning();

      // Re-open the job so the client can pick another freelancer.
      await ctx.db
        .update(jobs)
        .set({ status: 'open' })
        .where(eq(jobs.id, contract.jobId));

      const otherUserId =
        contract.clientId === ctx.user.id ? contract.freelancerId : contract.clientId;
      const actorName = partyName(ctx.user);
      await notify({
        userId: otherUserId,
        actorId: ctx.user.id,
        type: 'contract_cancelled',
        title: 'Contract cancelled',
        body: `${actorName} cancelled the contract for "${contract.title}".`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: { contractTitle: contract.title, reason: input.reason },
      });

      return updated;
    }),

  /**
   * Either party flags a dispute. Funds remain locked in escrow until an
   * arbiter resolves it (Phase 3C). For now we just record the reason and
   * notify the other side.
   */
  raiseDispute: protectedProcedure
    .input(disputeInput)
    .mutation(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      const isParty =
        contract.clientId === ctx.user.id || contract.freelancerId === ctx.user.id;
      if (!isParty) throw new TRPCError({ code: 'FORBIDDEN' });

      const disputable = ['in_progress', 'submitted', 'revision_requested'] as const;
      if (!disputable.includes(contract.status as (typeof disputable)[number])) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This contract cannot be disputed in its current state',
        });
      }

      const [updated] = await ctx.db
        .update(contracts)
        .set({
          status: 'disputed',
          disputeReason: input.reason,
        })
        .where(eq(contracts.id, contract.id))
        .returning();

      // Mirror the dispute on the job so it surfaces in admin views.
      await ctx.db
        .update(jobs)
        .set({ status: 'disputed' })
        .where(eq(jobs.id, contract.jobId));

      const otherUserId =
        contract.clientId === ctx.user.id ? contract.freelancerId : contract.clientId;
      const actorName = partyName(ctx.user);
      await notify({
        userId: otherUserId,
        actorId: ctx.user.id,
        type: 'contract_disputed',
        title: 'Contract disputed',
        body: `${actorName} raised a dispute on "${contract.title}".`,
        entityType: 'contract',
        entityId: contract.id,
        actionUrl: `/dashboard/contracts/${contract.id}`,
        metadata: { contractTitle: contract.title, reason: input.reason },
      });

      return updated;
    }),
});
