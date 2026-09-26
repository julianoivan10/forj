import { and, asc, contracts, db as defaultDb, eq, escrowEvents, escrowTransactions, isNull, jobs, sql, users } from '@forj/db';
import type { Database } from '@forj/db';
import { forjEscrowV3Abi } from '@forj/contracts';
import { decodeEventLog, formatUnits, type Hex } from 'viem';
import { log } from '../lib/log';
import { dollarsToUsdcUnits } from '../services/escrow';
import { notify } from '../services/notifications';
import type { EscrowV3Config } from './config';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Args = Record<string, string | number | boolean>;

/** Events that carry an `escrowId`; admin/config events are only logged. */
const ESCROW_EVENTS = new Set([
  'EscrowFunded',
  'WorkSubmitted',
  'RevisionRequested',
  'DisputeRaised',
  'Released',
  'Refunded',
  'DisputeResolved',
]);

export interface RawLog {
  address: Hex;
  topics: readonly Hex[];
  data: Hex;
  transactionHash: Hex | null;
  logIndex: number | null;
  blockNumber: bigint | null;
  blockHash: Hex | null;
}

export interface DecodedEscrowEvent {
  eventName: string;
  escrowId: bigint;
  args: Args;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
}

/** Decode one log of the V3 contract. Returns null for foreign or non-escrow logs. */
export function decodeEscrowLog(cfg: EscrowV3Config, raw: RawLog): DecodedEscrowEvent | null {
  if (raw.address.toLowerCase() !== cfg.escrowAddress.toLowerCase()) return null;
  if (raw.transactionHash == null || raw.logIndex == null || raw.blockNumber == null || raw.blockHash == null) {
    return null; // pending logs are never ingested
  }
  let decoded;
  try {
    decoded = decodeEventLog({ abi: forjEscrowV3Abi, topics: raw.topics as [Hex, ...Hex[]], data: raw.data });
  } catch {
    return null;
  }
  const args: Args = {};
  for (const [k, v] of Object.entries(decoded.args as Record<string, unknown>)) {
    args[k] = typeof v === 'bigint' ? v.toString() : typeof v === 'string' ? v.toLowerCase() : (v as number | boolean);
  }
  if (!ESCROW_EVENTS.has(decoded.eventName)) {
    log('warn', 'escrow.admin_event', { eventName: decoded.eventName, txHash: raw.transactionHash, args });
    return null;
  }
  return {
    eventName: decoded.eventName,
    escrowId: BigInt(args.escrowId as string),
    args,
    txHash: raw.transactionHash.toLowerCase() as Hex,
    logIndex: raw.logIndex,
    blockNumber: raw.blockNumber,
    blockHash: raw.blockHash,
  };
}

/**
 * Store decoded events (idempotent) and apply every not-yet-applied event
 * in chain order. Safe to call repeatedly with overlapping log sets.
 */
export async function ingestLogs(cfg: EscrowV3Config, rawLogs: readonly RawLog[], database: Database = defaultDb) {
  let inserted = 0;
  for (const raw of rawLogs) {
    const ev = decodeEscrowLog(cfg, raw);
    if (!ev) continue;
    const rows = await database
      .insert(escrowEvents)
      .values({
        chainId: cfg.chainId,
        escrowAddress: cfg.escrowAddress.toLowerCase(),
        txHash: ev.txHash,
        logIndex: ev.logIndex,
        blockNumber: ev.blockNumber,
        blockHash: ev.blockHash,
        escrowId: ev.escrowId,
        eventName: ev.eventName,
        args: ev.args,
      })
      .onConflictDoNothing()
      .returning({ id: escrowEvents.id });
    inserted += rows.length;
  }
  const applied = await applyPendingEvents(cfg, database);
  return { inserted, applied };
}

export async function applyPendingEvents(cfg: EscrowV3Config, database: Database = defaultDb) {
  const pending = await database
    .select()
    .from(escrowEvents)
    .where(
      and(
        eq(escrowEvents.chainId, cfg.chainId),
        eq(escrowEvents.escrowAddress, cfg.escrowAddress.toLowerCase()),
        isNull(escrowEvents.appliedAt),
      ),
    )
    .orderBy(asc(escrowEvents.blockNumber), asc(escrowEvents.logIndex));

  let applied = 0;
  for (const ev of pending) {
    const sideEffects: Array<() => Promise<void>> = [];
    await database.transaction(async (tx) => {
      // Re-check inside the transaction so two concurrent runners can't both apply it.
      const [claimed] = await tx
        .update(escrowEvents)
        .set({ appliedAt: new Date() })
        .where(and(eq(escrowEvents.id, ev.id), isNull(escrowEvents.appliedAt)))
        .returning({ id: escrowEvents.id });
      if (!claimed) return;
      const contractId = await applyEvent(tx, cfg, ev, sideEffects);
      if (contractId) await tx.update(escrowEvents).set({ contractId }).where(eq(escrowEvents.id, ev.id));
    });
    applied += 1;
    for (const effect of sideEffects) {
      try {
        await effect();
      } catch (err) {
        log('error', 'escrow.side_effect_failed', { eventId: ev.id, err });
      }
    }
  }
  return applied;
}

const toDate = (seconds: string | number | boolean | undefined) =>
  seconds && Number(seconds) > 0 ? new Date(Number(seconds) * 1000) : null;

type EventRow = typeof escrowEvents.$inferSelect;

async function applyEvent(
  tx: Tx,
  cfg: EscrowV3Config,
  ev: EventRow,
  sideEffects: Array<() => Promise<void>>,
): Promise<string | null> {
  const a = ev.args;
  const address = cfg.escrowAddress.toLowerCase();

  const contract =
    ev.eventName === 'EscrowFunded'
      ? await tx.query.contracts.findFirst({
          where: eq(contracts.contractRef, String(a.contractRef)),
          with: {
            client: { columns: { id: true, walletAddress: true } },
            freelancer: { columns: { id: true, walletAddress: true } },
          },
        })
      : await tx.query.contracts.findFirst({
          where: and(eq(contracts.escrowContractAddress, address), eq(contracts.onChainContractId, Number(ev.escrowId))),
          with: {
            client: { columns: { id: true, walletAddress: true } },
            freelancer: { columns: { id: true, walletAddress: true } },
          },
        });

  if (!contract) {
    log('warn', 'escrow.event_unmatched', { eventName: ev.eventName, escrowId: ev.escrowId, txHash: ev.txHash });
    return null;
  }

  // Out-of-order guard: never let an older event overwrite newer state.
  if (
    contract.lastEventBlock != null &&
    (ev.blockNumber < contract.lastEventBlock ||
      (ev.blockNumber === contract.lastEventBlock && ev.logIndex <= (contract.lastEventLogIndex ?? -1)))
  ) {
    return contract.id;
  }

  const cursor = { lastEventBlock: ev.blockNumber, lastEventLogIndex: ev.logIndex };
  const now = new Date();

  switch (ev.eventName) {
    case 'EscrowFunded': {
      const clientOk = contract.client.walletAddress?.toLowerCase() === String(a.client);
      if (!clientOk) {
        // Someone else funded an escrow with this reference. It can't be ours:
        // references are scoped per client on-chain.
        log('warn', 'escrow.foreign_funding_ignored', { contractId: contract.id, escrowId: ev.escrowId, txHash: ev.txHash });
        return null;
      }
      const termsOk =
        contract.freelancer.walletAddress?.toLowerCase() === String(a.freelancer) &&
        dollarsToUsdcUnits(contract.totalAmount).toString() === String(a.amount);
      if (!termsOk || contract.onChainContractId != null) {
        const issue = contract.onChainContractId != null
          ? `A second escrow (#${ev.escrowId}) was funded for this contract.`
          : `Escrow #${ev.escrowId} was funded with terms that don't match this contract.`;
        await tx.update(contracts).set({ syncIssue: issue }).where(eq(contracts.id, contract.id));
        log('error', 'escrow.funding_mismatch', { contractId: contract.id, escrowId: ev.escrowId, txHash: ev.txHash, issue });
        return contract.id;
      }
      await tx
        .update(contracts)
        .set({
          ...cursor,
          escrowVersion: 'v3',
          chainId: cfg.chainId,
          escrowContractAddress: address,
          onChainContractId: Number(ev.escrowId),
          escrowTxHash: ev.txHash,
          onChainStatus: 'funded',
          onChainMaxRevisions: Number(a.maxRevisions),
          workDeadlineAt: toDate(a.workDeadline),
          status: 'in_progress',
          fundedAt: contract.fundedAt ?? now,
          syncIssue: null,
        })
        .where(eq(contracts.id, contract.id));
      sideEffects.push(() =>
        notify({
          userId: contract.freelancerId,
          actorId: contract.clientId,
          type: 'contract_funded',
          title: 'Escrow funded — start working',
          body: `The escrow for "${contract.title}" is confirmed on-chain. You can begin the work.`,
          entityType: 'contract',
          entityId: contract.id,
          actionUrl: `/dashboard/contracts/${contract.id}`,
          metadata: { contractTitle: contract.title, txHash: ev.txHash, amount: contract.totalAmount },
        }),
      );
      break;
    }

    case 'WorkSubmitted': {
      const reviewDeadline = toDate(a.reviewDeadline);
      const meta = await txMetadata(tx, cfg, ev.txHash);
      await tx
        .update(contracts)
        .set({
          ...cursor,
          onChainStatus: 'submitted',
          reviewDeadlineAt: reviewDeadline,
          autoReleaseAt: reviewDeadline,
          status: 'submitted',
          submittedAt: now,
          ...(typeof meta.message === 'string' ? { submissionMessage: meta.message } : {}),
          ...(Array.isArray(meta.files) ? { submissionFiles: meta.files as string[] } : {}),
        })
        .where(eq(contracts.id, contract.id));
      sideEffects.push(() =>
        notify({
          userId: contract.clientId,
          actorId: contract.freelancerId,
          type: 'contract_submitted',
          title: 'Work submitted for review',
          body: `Work on "${contract.title}" is waiting for your review.`,
          entityType: 'contract',
          entityId: contract.id,
          actionUrl: `/dashboard/contracts/${contract.id}`,
          metadata: { contractTitle: contract.title, autoReleaseAt: reviewDeadline?.toISOString() },
        }),
      );
      break;
    }

    case 'RevisionRequested': {
      const meta = await txMetadata(tx, cfg, ev.txHash);
      await tx
        .update(contracts)
        .set({
          ...cursor,
          onChainStatus: 'revision_requested',
          onChainRevisionCount: Number(a.revisionCount),
          revisionCount: Number(a.revisionCount),
          workDeadlineAt: toDate(a.workDeadline),
          reviewDeadlineAt: null,
          autoReleaseAt: null,
          status: 'revision_requested',
          ...(typeof meta.reason === 'string' ? { revisionReason: meta.reason } : {}),
        })
        .where(eq(contracts.id, contract.id));
      sideEffects.push(() =>
        notify({
          userId: contract.freelancerId,
          actorId: contract.clientId,
          type: 'contract_revision_requested',
          title: 'Revision requested',
          body: `The client asked for changes on "${contract.title}".`,
          entityType: 'contract',
          entityId: contract.id,
          actionUrl: `/dashboard/contracts/${contract.id}`,
          metadata: { contractTitle: contract.title, reason: meta.reason },
        }),
      );
      break;
    }

    case 'DisputeRaised': {
      const meta = await txMetadata(tx, cfg, ev.txHash);
      await tx
        .update(contracts)
        .set({
          ...cursor,
          onChainStatus: 'disputed',
          disputeDeadlineAt: toDate(a.disputeDeadline),
          reviewDeadlineAt: null,
          autoReleaseAt: null,
          status: 'disputed',
          ...(typeof meta.reason === 'string' ? { disputeReason: meta.reason } : {}),
        })
        .where(eq(contracts.id, contract.id));
      await tx.update(jobs).set({ status: 'disputed' }).where(eq(jobs.id, contract.jobId));
      const byClient = String(a.by) === contract.client.walletAddress?.toLowerCase();
      sideEffects.push(() =>
        notify({
          userId: byClient ? contract.freelancerId : contract.clientId,
          actorId: byClient ? contract.clientId : contract.freelancerId,
          type: 'contract_disputed',
          title: 'Contract disputed',
          body: `A dispute was opened on "${contract.title}". Funds are frozen until it is resolved.`,
          entityType: 'contract',
          entityId: contract.id,
          actionUrl: `/dashboard/contracts/${contract.id}`,
          metadata: { contractTitle: contract.title, reason: meta.reason },
        }),
      );
      break;
    }

    case 'Released':
    case 'DisputeResolved': {
      const toFreelancer = BigInt(String(a.toFreelancer));
      const toFee = BigInt(String(a.toFee));
      const toClient = ev.eventName === 'DisputeResolved' ? BigInt(String(a.toClient)) : 0n;
      const fullyPaid = ev.eventName === 'Released' || Number(a.freelancerShareBps) === 10_000;
      await tx
        .update(contracts)
        .set({
          ...cursor,
          onChainStatus: ev.eventName === 'Released' ? 'released' : 'resolved',
          settledToFreelancer: toFreelancer.toString(),
          settledToClient: toClient.toString(),
          settledToFee: toFee.toString(),
          reviewDeadlineAt: null,
          disputeDeadlineAt: null,
          autoReleaseAt: null,
          status: toFreelancer > 0n ? 'completed' : 'refunded',
          completedAt: now,
          releaseTxHash: ev.txHash,
        })
        .where(eq(contracts.id, contract.id));
      if (toFreelancer > 0n) {
        // Earnings reflect what the chain actually paid out.
        await tx
          .update(users)
          .set({
            totalEarned: sql`${users.totalEarned} + ${formatUnits(toFreelancer, 6)}`,
            ...(fullyPaid ? { totalJobsCompleted: sql`${users.totalJobsCompleted} + 1` } : {}),
          })
          .where(eq(users.id, contract.freelancerId));
      }
      await tx
        .update(jobs)
        .set({ status: toFreelancer > 0n ? 'completed' : 'cancelled' })
        .where(eq(jobs.id, contract.jobId));
      for (const userId of [contract.freelancerId, contract.clientId]) {
        sideEffects.push(() =>
          notify({
            userId,
            type: ev.eventName === 'Released' ? 'contract_completed' : 'system',
            title: ev.eventName === 'Released' ? 'Payment released' : 'Dispute resolved',
            body: `"${contract.title}" settled on-chain: ${formatUnits(toFreelancer, 6)} USDC to the freelancer, ${formatUnits(toClient, 6)} USDC back to the client.`,
            entityType: 'contract',
            entityId: contract.id,
            actionUrl: `/dashboard/contracts/${contract.id}`,
            metadata: { contractTitle: contract.title, freelancerAmount: formatUnits(toFreelancer, 6), releaseTxHash: ev.txHash },
          }),
        );
      }
      break;
    }

    case 'Refunded': {
      await tx
        .update(contracts)
        .set({
          ...cursor,
          onChainStatus: 'refunded',
          settledToFreelancer: '0',
          settledToClient: String(a.toClient),
          settledToFee: '0',
          reviewDeadlineAt: null,
          autoReleaseAt: null,
          status: 'refunded',
          cancelledAt: now,
        })
        .where(eq(contracts.id, contract.id));
      await tx.update(jobs).set({ status: 'cancelled' }).where(eq(jobs.id, contract.jobId));
      for (const userId of [contract.freelancerId, contract.clientId]) {
        sideEffects.push(() =>
          notify({
            userId,
            type: 'contract_cancelled',
            title: 'Escrow refunded',
            body: `The full deposit for "${contract.title}" was returned to the client.`,
            entityType: 'contract',
            entityId: contract.id,
            actionUrl: `/dashboard/contracts/${contract.id}`,
            metadata: { contractTitle: contract.title },
          }),
        );
      }
      break;
    }
  }

  // The event is on-chain truth: any recorded transaction that produced it is confirmed.
  await tx
    .update(escrowTransactions)
    .set({ status: 'confirmed', blockNumber: ev.blockNumber, confirmedAt: now, failureReason: null })
    .where(and(eq(escrowTransactions.chainId, cfg.chainId), eq(escrowTransactions.txHash, ev.txHash)));

  log('info', 'escrow.event_applied', {
    contractId: contract.id,
    eventName: ev.eventName,
    escrowId: ev.escrowId,
    txHash: ev.txHash,
    block: ev.blockNumber,
  });
  return contract.id;
}

/** Off-chain metadata recorded with the transaction that emitted this event. */
async function txMetadata(tx: Tx, cfg: EscrowV3Config, txHash: string): Promise<Record<string, unknown>> {
  const row = await tx.query.escrowTransactions.findFirst({
    where: and(eq(escrowTransactions.chainId, cfg.chainId), eq(escrowTransactions.txHash, txHash)),
    columns: { metadata: true },
  });
  return row?.metadata ?? {};
}
