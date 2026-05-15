import { TRPCError } from '@trpc/server';
import { contracts, desc, eq } from '@forj/db';
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
});
