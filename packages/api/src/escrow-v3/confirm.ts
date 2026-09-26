import { and, contracts, db as defaultDb, eq, escrowTransactions } from '@forj/db';
import type { Database, EscrowTransaction } from '@forj/db';
import { TransactionReceiptNotFoundError, type Hex } from 'viem';
import { log } from '../lib/log';
import { getV3Client, type EscrowV3Config, type V3Client } from './config';
import { decodeEscrowLog, ingestLogs } from './processor';

/** The event each recorded action must produce for the transaction to count. */
export const EXPECTED_EVENT: Record<EscrowTransaction['action'], string> = {
  fund: 'EscrowFunded',
  submit_work: 'WorkSubmitted',
  request_revision: 'RevisionRequested',
  release: 'Released',
  release_after_review: 'Released',
  cancel_by_freelancer: 'Refunded',
  refund_after_deadline: 'Refunded',
  raise_dispute: 'DisputeRaised',
  resolve_dispute: 'DisputeResolved',
  resolve_expired_dispute: 'DisputeResolved',
};

/** A transaction nobody can find on-chain after this long is treated as dropped. */
const DROPPED_AFTER_MS = 30 * 60 * 1000;

export type ConfirmOutcome = 'confirmed' | 'pending' | 'failed';

/**
 * Check one recorded transaction against the chain.
 *
 *  - not mined yet            → stays pending (dropped after 30 minutes)
 *  - reverted                 → failed
 *  - mined, expected event for this escrow present → logs ingested; the
 *    event processor marks the transaction confirmed and updates the row
 *  - mined, but it did not perform the recorded action on this escrow
 *    (e.g. a smart-wallet UserOp whose inner call reverted) → failed
 *
 * Never marks anything confirmed on the caller's word.
 */
export async function confirmEscrowTransaction(
  cfg: EscrowV3Config,
  txRow: EscrowTransaction,
  database: Database = defaultDb,
  client: V3Client = getV3Client(cfg),
): Promise<ConfirmOutcome> {
  if (txRow.status !== 'pending') return txRow.status;

  const fail = async (reason: string) => {
    await database
      .update(escrowTransactions)
      .set({ status: 'failed', failureReason: reason, lastCheckedAt: new Date(), attempts: txRow.attempts + 1 })
      .where(and(eq(escrowTransactions.id, txRow.id), eq(escrowTransactions.status, 'pending')));
    log('warn', 'escrow.tx_failed', { txId: txRow.id, contractId: txRow.contractId, action: txRow.action, txHash: txRow.txHash, reason });
    return 'failed' as const;
  };

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txRow.txHash as Hex });
  } catch (err) {
    if (!(err instanceof TransactionReceiptNotFoundError)) {
      log('warn', 'escrow.rpc_error', { txId: txRow.id, err });
      return 'pending';
    }
    const age = Date.now() - txRow.createdAt.getTime();
    if (age > DROPPED_AFTER_MS) {
      const seen = await client.getTransaction({ hash: txRow.txHash as Hex }).catch(() => null);
      if (!seen) return fail('The transaction was never mined (dropped or replaced). You can safely try again.');
    }
    await database
      .update(escrowTransactions)
      .set({ lastCheckedAt: new Date(), attempts: txRow.attempts + 1 })
      .where(eq(escrowTransactions.id, txRow.id));
    return 'pending';
  }

  if (receipt.status !== 'success') return fail('The transaction reverted on-chain. Nothing changed; you can try again.');

  const contract = await database.query.contracts.findFirst({
    where: eq(contracts.id, txRow.contractId),
    columns: { id: true, onChainContractId: true, contractRef: true },
  });
  const expected = EXPECTED_EVENT[txRow.action];
  const matching = receipt.logs
    .map((l) => decodeEscrowLog(cfg, l))
    .find((ev) => {
      if (!ev || ev.eventName !== expected) return false;
      if (txRow.action === 'fund') return ev.args.contractRef === contract?.contractRef?.toLowerCase();
      return contract?.onChainContractId != null && ev.escrowId === BigInt(contract.onChainContractId);
    });
  if (!matching) {
    return fail(`The transaction succeeded but did not perform "${txRow.action}" on this escrow.`);
  }

  await ingestLogs(cfg, receipt.logs, database);

  const after = await database.query.escrowTransactions.findFirst({
    where: eq(escrowTransactions.id, txRow.id),
    columns: { status: true },
  });
  return after?.status ?? 'pending';
}
