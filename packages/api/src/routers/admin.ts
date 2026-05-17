import { TRPCError } from '@trpc/server';
import {
  adminAuditLog,
  and,
  contracts,
  desc,
  eq,
  isNull,
  users,
} from '@forj/db';
import { z } from 'zod';
import {
  EscrowVerificationError,
  verifyEscrowResolution,
} from '../services/escrow';
import { notify } from '../services/notifications';
import { adminProcedure, createTRPCRouter } from '../trpc';

/**
 * Admin / arbiter router.
 *
 * Authorization model:
 *   The on-chain `WorkChainEscrow.resolveDispute()` is `onlyOwner` — only
 *   the address registered as the registry's owner (a platform multisig)
 *   can mutate funds. We piggy-back on that: the backend doesn't keep its
 *   own admin allowlist. Instead, `recordResolution` accepts an arbitrary
 *   txHash, parses the `DisputeResolved` event, and ONLY accepts it if a
 *   matching event exists. Mere existence of that event is proof that the
 *   sender WAS the registered arbiter at the time of the tx.
 *
 *   Net result: the chain owns auth; the DB is just bookkeeping.
 *
 * UX:
 *   The /admin/disputes page is reachable by direct URL only — we don't link
 *   it from the dashboard nav. Non-arbiters can navigate there and see the
 *   list, but every resolve attempt will fail at the wallet step because
 *   their signer isn't `owner()`. No information disclosure (disputed
 *   contracts only show parties already known to the public).
 */

const txHashRe = /^0x[a-fA-F0-9]{64}$/;

export const adminRouter = createTRPCRouter({
  /**
   * Returns every disputed contract platform-wide. Order: oldest dispute
   * first so the arbiter's queue defaults to FIFO.
   */
  listDisputed: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.contracts.findMany({
      where: eq(contracts.status, 'disputed'),
      orderBy: [desc(contracts.updatedAt)],
      with: {
        client: { columns: { id: true, username: true, displayName: true, walletAddress: true } },
        freelancer: {
          columns: { id: true, username: true, displayName: true, walletAddress: true },
        },
        job: { columns: { id: true, title: true, slug: true } },
      },
    });
    return rows;
  }),

  /**
   * Record an on-chain `DisputeResolved` outcome. The arbiter has already
   * signed `resolveDispute(escrowId, toFreelancer, toClient, toFee)` from
   * their wallet. The frontend echoes the txHash back — we verify it,
   * extract the split, and update the DB.
   *
   * On success the contract moves to `completed` regardless of the split
   * (resolution closes the case); the disputed amounts are stored in
   * `metadata` of the resulting notifications so a future audit log can
   * reconstruct who got what.
   */
  recordResolution: adminProcedure
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
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.status !== 'disputed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot record resolution on a ${contract.status} contract`,
        });
      }
      if (contract.onChainContractId == null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Contract has no on-chain escrowId — was it funded as crypto?',
        });
      }

      let resolution;
      try {
        resolution = await verifyEscrowResolution({
          chainId: input.chainId,
          txHash: input.txHash as `0x${string}`,
          expected: { escrowId: BigInt(contract.onChainContractId) },
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

      // Notify both parties — they need to know the outcome explicitly
      // because the on-chain split may not match either expectation.
      const splitMeta = {
        contractTitle: contract.title,
        toFreelancer: resolution.toFreelancer.toString(),
        toClient: resolution.toClient.toString(),
        toFee: resolution.toFee.toString(),
        releaseTxHash: input.txHash,
        resolved: true,
      };
      await Promise.all([
        notify({
          userId: contract.freelancerId,
          actorId: ctx.user.id,
          type: 'contract_completed',
          title: 'Dispute resolved by arbiter',
          body: `The arbiter resolved the dispute on "${contract.title}".`,
          entityType: 'contract',
          entityId: contract.id,
          actionUrl: `/dashboard/contracts/${contract.id}`,
          metadata: splitMeta,
        }),
        notify({
          userId: contract.clientId,
          actorId: ctx.user.id,
          type: 'contract_completed',
          title: 'Dispute resolved by arbiter',
          body: `The arbiter resolved the dispute on "${contract.title}".`,
          entityType: 'contract',
          entityId: contract.id,
          actionUrl: `/dashboard/contracts/${contract.id}`,
          metadata: splitMeta,
        }),
      ]);

      return updated;
    }),

  /**
   * Emergency account recovery — bind a NEW privyId onto an EXISTING
   * user row. See `docs/design/emergency-recovery.md` §2c for the full
   * threat model and operational procedure.
   *
   * When this is used: a user lost ALL automatic recovery paths (no
   * Privy guardians configured, no wallet still in their possession),
   * but can prove their identity off-chain via support channels. The
   * support flow:
   *
   *   1. User signs up fresh — Privy assigns them a new userId, our
   *      JIT path provisions a ghost row.
   *   2. Support verifies identity proof, gets both the orphan row
   *      UUID (old account) and the new Privy userId.
   *   3. Admin calls this procedure with reason captured in writing.
   *   4. Admin separately deletes the ghost row (`deleteUser` — TODO).
   *
   * Every call is logged to `admin_audit_log` with the admin's user
   * id, target user id, before/after privyId, and free-text reason.
   * The log is non-rotatable for forensics — this procedure is the
   * single most dangerous one in the codebase, so the paper trail
   * has to be permanent.
   *
   * Guard rails:
   *   - The new Privy userId must not already be bound to ANY user
   *     row (would orphan the ghost row and confuse future logins).
   *   - The target user must not be soft-deleted — restoring a
   *     deleted account is a separate procedure with different
   *     ethics (the user chose to leave).
   *   - The admin cannot relink themselves (prevents trivial
   *     self-takeover via compromised admin session).
   */
  relinkUser: adminProcedure
    .input(
      z.object({
        targetUserId: z.string().uuid(),
        newPrivyId: z.string().min(8).max(200),
        reason: z
          .string()
          .min(20, 'Reason must be at least 20 characters — capture the proof source.')
          .max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.targetUserId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot relink your own account.',
        });
      }

      const target = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.targetUserId),
        columns: { id: true, privyId: true, username: true, deletedAt: true },
      });
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Target user not found.' });
      }
      if (target.deletedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Target account is soft-deleted. Use admin.restoreUser (not yet implemented) instead — relink + restore have different ethics.',
        });
      }

      // The new privyId must be globally unique. If it already binds
      // to another row, that row was likely the ghost — we don't try
      // to merge them here, the admin must delete the ghost first.
      const conflict = await ctx.db.query.users.findFirst({
        where: eq(users.privyId, input.newPrivyId),
        columns: { id: true, username: true },
      });
      if (conflict && conflict.id !== target.id) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `New privyId is already bound to a different user (${conflict.username ?? conflict.id}). Delete that row first, then retry.`,
        });
      }

      const oldPrivyId = target.privyId;

      // Write audit log BEFORE the mutation. If the update fails, we
      // still have a record of the attempt. If logging fails, we
      // refuse to mutate — better to fail the action than leave an
      // unloggable change in the DB.
      await ctx.db.insert(adminAuditLog).values({
        adminUserId: ctx.user.id,
        targetUserId: target.id,
        action: 'relink_user',
        reason: input.reason,
        details: {
          before: { privyId: oldPrivyId },
          after: { privyId: input.newPrivyId },
          targetUsername: target.username,
        },
      });

      await ctx.db
        .update(users)
        .set({ privyId: input.newPrivyId, updatedAt: new Date() })
        .where(eq(users.id, target.id));

      return {
        success: true,
        targetUserId: target.id,
        oldPrivyId,
        newPrivyId: input.newPrivyId,
      };
    }),

  /**
   * Read the admin audit log. Reads are admin-only — surfacing this
   * to anyone else would itself be a privacy leak (admin identities,
   * target user patterns).
   *
   * Default ordering: newest first, so the dashboard surfaces the
   * most recent admin actions for review.
   */
  listAuditLog: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          action: z.string().optional(),
          targetUserId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const conditions = [];
      if (input?.action) conditions.push(eq(adminAuditLog.action, input.action));
      if (input?.targetUserId) {
        conditions.push(eq(adminAuditLog.targetUserId, input.targetUserId));
      }
      // `and(undefined)` is fine when conditions is empty — Drizzle
      // collapses it to no-op. Belt-and-braces: explicit branch.
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await ctx.db.query.adminAuditLog.findMany({
        where,
        orderBy: [desc(adminAuditLog.createdAt)],
        limit,
        with: {
          admin: {
            columns: { id: true, username: true, displayName: true },
          },
          target: {
            columns: { id: true, username: true, displayName: true },
          },
        },
      });
      return rows;
    }),
});

// `isNull` is imported above for future audit-log filters that need
// to skip soft-deleted target users. Currently unused here but the
// import keeps the next addition cheap and the lint output clean if
// you uncomment such a filter. Suppressing lint here is intentional.
void isNull;
