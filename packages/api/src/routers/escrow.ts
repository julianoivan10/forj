import { TRPCError } from '@trpc/server';
import { and, contracts, desc, eq, escrowEvents, escrowTransactions } from '@forj/db';
import { DEFAULT_CLIENT_FEE_BPS, DEFAULT_FREELANCER_FEE_BPS, ESCROW_V3_TERMINAL } from '@forj/contracts';
import { z } from 'zod';
import {
  confirmEscrowTransaction,
  contractRefFor,
  getEscrowV3Config,
  isEscrowV3Enabled,
} from '../escrow-v3';
import { isAllowedFileUrl } from '../lib/file-host';
import { log } from '../lib/log';
import { checkRateLimit, RATE_LIMITS } from '../middleware/rate-limit';
import { EscrowVerificationError, dollarsToUsdcUnits } from '../services/escrow';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

const hex0x = /^0x[a-fA-F0-9]{40}$/;
const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash').transform((h) => h.toLowerCase());

/** Which party may record which action. Arbiter resolutions go through the admin router. */
const PARTY_ACTIONS = {
  client: ['fund', 'request_revision', 'release', 'refund_after_deadline', 'raise_dispute', 'release_after_review', 'resolve_expired_dispute'],
  freelancer: ['submit_work', 'cancel_by_freelancer', 'raise_dispute', 'release_after_review', 'resolve_expired_dispute'],
} as const;

const partyActionSchema = z.enum([
  'fund',
  'submit_work',
  'request_revision',
  'release',
  'release_after_review',
  'cancel_by_freelancer',
  'refund_after_deadline',
  'raise_dispute',
  'resolve_expired_dispute',
]);

/** Off-chain data that travels with an action; copied to the contract on confirmation. */
const metadataSchema = z
  .object({
    message: z.string().min(10).max(5000).optional(),
    files: z.array(z.string().url().refine(isAllowedFileUrl, 'Attachments must be uploaded through Forj.')).max(10).optional(),
    reason: z.string().min(10).max(3000).optional(),
  })
  .strict()
  .optional();

function toTrpc(err: unknown): never {
  if (err instanceof EscrowVerificationError) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
  }
  throw err;
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint?: string; message?: string; cause?: { code?: string; constraint?: string } };
  const code = e.code ?? e.cause?.code;
  const name = e.constraint ?? e.cause?.constraint ?? '';
  return code === '23505' && (name === constraint || (e.message ?? '').includes(constraint));
}

export const escrowRouter = createTRPCRouter({
  /** Public: which escrow deployment new contracts use, for display. */
  config: publicProcedure.query(() => {
    if (!isEscrowV3Enabled()) return { enabled: false as const };
    const cfg = getEscrowV3Config();
    return {
      enabled: true as const,
      chainId: cfg.chainId,
      escrowAddress: cfg.escrowAddress,
      usdcAddress: cfg.usdcAddress,
      explorer: cfg.explorer,
    };
  }),

  /**
   * Server-computed terms for `ForjEscrowV3.fund()`. The client signs
   * exactly these values; amount, parties, deadline, reference, contract
   * address and chain never come from the browser.
   */
  prepareFunding: protectedProcedure
    .input(z.object({ contractId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      let cfg;
      try {
        cfg = getEscrowV3Config();
      } catch (err) {
        toTrpc(err);
      }
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        with: {
          client: { columns: { id: true, walletAddress: true } },
          freelancer: { columns: { id: true, walletAddress: true } },
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the client can fund this contract' });
      }
      if (contract.status !== 'created' || contract.onChainContractId != null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This contract is already funded or closed.' });
      }
      if (contract.paymentMethod !== 'crypto') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only on-chain USDC escrow funding is supported.' });
      }
      const clientWallet = contract.client.walletAddress;
      const freelancerWallet = contract.freelancer.walletAddress;
      if (!clientWallet || !hex0x.test(clientWallet)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Connect a wallet before funding.' });
      }
      if (!freelancerWallet || !hex0x.test(freelancerWallet)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The freelancer has no wallet on file yet.' });
      }
      const deadline = Math.floor(contract.deliveryDeadline.getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      if (deadline <= now + 3600) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The delivery deadline has passed or is less than an hour away. Update the terms first.',
        });
      }

      const amount = dollarsToUsdcUnits(contract.totalAmount);
      if (amount < 1_000_000n) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Escrow amount must be at least 1 USDC.' });
      }
      const clientFee = (amount * BigInt(DEFAULT_CLIENT_FEE_BPS)) / 10_000n;
      const contractRef = contract.contractRef ?? contractRefFor(contract.id);

      await ctx.db
        .update(contracts)
        .set({
          escrowVersion: 'v3',
          chainId: cfg.chainId,
          contractRef,
          escrowContractAddress: cfg.escrowAddress.toLowerCase(),
        })
        .where(and(eq(contracts.id, contract.id), eq(contracts.status, 'created')));

      return {
        chainId: cfg.chainId,
        escrowAddress: cfg.escrowAddress,
        usdcAddress: cfg.usdcAddress,
        contractRef,
        freelancer: freelancerWallet,
        client: clientWallet,
        amount: amount.toString(),
        clientFee: clientFee.toString(),
        total: (amount + clientFee).toString(),
        deliveryDeadline: deadline,
        maxClientFeeBps: DEFAULT_CLIENT_FEE_BPS,
        maxFreelancerFeeBps: DEFAULT_FREELANCER_FEE_BPS,
      };
    }),

  /**
   * Tell Forj about a transaction the caller just sent. Recorded as
   * pending, then checked against the chain immediately. The contract
   * row only changes when the expected event is decoded from the receipt
   * or the logs, so recording a hash can never fake a transition.
   */
  recordTransaction: protectedProcedure
    .input(
      z.object({
        contractId: z.string().uuid(),
        action: partyActionSchema,
        txHash: txHashSchema,
        chainId: z.number().int().positive(),
        metadata: metadataSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(ctx.user.id, 'escrowTx', RATE_LIMITS.escrowTx);
      let cfg;
      try {
        cfg = getEscrowV3Config();
      } catch (err) {
        toTrpc(err);
      }
      if (input.chainId !== cfg.chainId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Transaction is on chain ${input.chainId}, but Forj settles on chain ${cfg.chainId}.`,
        });
      }
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        columns: {
          id: true,
          clientId: true,
          freelancerId: true,
          escrowVersion: true,
          status: true,
          contractRef: true,
          onChainContractId: true,
          onChainStatus: true,
          escrowContractAddress: true,
        },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      const role = contract.clientId === ctx.user.id ? 'client' : contract.freelancerId === ctx.user.id ? 'freelancer' : null;
      if (!role) throw new TRPCError({ code: 'FORBIDDEN' });
      if (!(PARTY_ACTIONS[role] as readonly string[]).includes(input.action)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `The ${role} cannot perform "${input.action}".` });
      }
      // Idempotency first: the same hash reported again (double click, retry
      // after a timeout, second tab) returns the existing record even if the
      // contract has already moved on because of it.
      const existing = await ctx.db.query.escrowTransactions.findFirst({
        where: and(eq(escrowTransactions.chainId, cfg.chainId), eq(escrowTransactions.txHash, input.txHash)),
      });
      if (existing) {
        if (existing.contractId === contract.id && existing.action === input.action) {
          return { transaction: existing, outcome: existing.status };
        }
        throw new TRPCError({ code: 'CONFLICT', message: 'This transaction is already recorded for another action.' });
      }

      if (contract.escrowVersion !== 'v3' || contract.escrowContractAddress !== cfg.escrowAddress.toLowerCase()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This contract is not using the current escrow contract.' });
      }
      if (input.action === 'fund') {
        if (contract.status !== 'created' || !contract.contractRef) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Prepare funding before recording a funding transaction.' });
        }
      } else if (contract.onChainContractId == null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The escrow is not funded yet.' });
      } else if ((ESCROW_V3_TERMINAL as readonly string[]).includes(contract.onChainStatus)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This escrow is already settled.' });
      }

      let row;
      try {
        [row] = await ctx.db
          .insert(escrowTransactions)
          .values({
            contractId: contract.id,
            chainId: cfg.chainId,
            escrowAddress: cfg.escrowAddress.toLowerCase(),
            action: input.action,
            txHash: input.txHash,
            initiatedBy: ctx.user.id,
            metadata: input.metadata ?? null,
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err, 'escrow_tx_chain_hash_unique')) {
          // Same hash reported again (double click, retry): idempotent.
          const existing = await ctx.db.query.escrowTransactions.findFirst({
            where: and(eq(escrowTransactions.chainId, cfg.chainId), eq(escrowTransactions.txHash, input.txHash)),
          });
          if (existing && existing.contractId === contract.id && existing.action === input.action) {
            return { transaction: existing, outcome: existing.status };
          }
          throw new TRPCError({ code: 'CONFLICT', message: 'This transaction is already recorded for another action.' });
        }
        if (isUniqueViolation(err, 'escrow_tx_one_pending_per_contract')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Another transaction for this contract is still waiting for confirmation.',
          });
        }
        throw err;
      }
      if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      log('info', 'escrow.tx_recorded', { txId: row.id, contractId: contract.id, action: input.action, txHash: input.txHash, userId: ctx.user.id });

      const outcome = await confirmEscrowTransaction(cfg, row, ctx.db);
      const transaction = await ctx.db.query.escrowTransactions.findFirst({ where: eq(escrowTransactions.id, row.id) });
      return { transaction: transaction ?? row, outcome };
    }),

  /** Re-check a pending transaction (polled by the UI). Party-only. */
  syncTransaction: protectedProcedure
    .input(z.object({ transactionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.escrowTransactions.findFirst({
        where: eq(escrowTransactions.id, input.transactionId),
        with: { contract: { columns: { clientId: true, freelancerId: true } } },
      });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (row.contract.clientId !== ctx.user.id && row.contract.freelancerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (row.status !== 'pending') return { status: row.status, failureReason: row.failureReason };
      let cfg;
      try {
        cfg = getEscrowV3Config();
      } catch (err) {
        toTrpc(err);
      }
      const outcome = await confirmEscrowTransaction(cfg, row, ctx.db);
      const fresh = await ctx.db.query.escrowTransactions.findFirst({
        where: eq(escrowTransactions.id, row.id),
        columns: { status: true, failureReason: true },
      });
      return { status: fresh?.status ?? outcome, failureReason: fresh?.failureReason ?? null };
    }),

  /** Transaction history and confirmed on-chain events for one contract. Party-only. */
  activity: protectedProcedure
    .input(z.object({ contractId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contract = await ctx.db.query.contracts.findFirst({
        where: eq(contracts.id, input.contractId),
        columns: { id: true, clientId: true, freelancerId: true },
      });
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND' });
      if (contract.clientId !== ctx.user.id && contract.freelancerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const [transactions, events] = await Promise.all([
        ctx.db.query.escrowTransactions.findMany({
          where: eq(escrowTransactions.contractId, contract.id),
          orderBy: [desc(escrowTransactions.createdAt)],
          columns: {
            id: true,
            action: true,
            txHash: true,
            status: true,
            failureReason: true,
            blockNumber: true,
            createdAt: true,
            confirmedAt: true,
            initiatedBy: true,
          },
          limit: 50,
        }),
        ctx.db.query.escrowEvents.findMany({
          where: eq(escrowEvents.contractId, contract.id),
          orderBy: [desc(escrowEvents.blockNumber), desc(escrowEvents.logIndex)],
          columns: { eventName: true, txHash: true, blockNumber: true, args: true, createdAt: true },
          limit: 50,
        }),
      ]);
      return { transactions, events };
    }),
});
