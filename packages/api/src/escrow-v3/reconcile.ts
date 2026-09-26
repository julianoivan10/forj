import { and, contracts, db as defaultDb, eq, escrowTransactions, inArray, isNotNull, lt, or, isNull } from '@forj/db';
import type { Database } from '@forj/db';
import { ESCROW_V3_STATUS, forjEscrowV3Abi, type EscrowV3Status } from '@forj/contracts';
import { pad, toHex, type Hex } from 'viem';
import { log } from '../lib/log';
import { getV3Client, type EscrowV3Config, type V3Client } from './config';
import { confirmEscrowTransaction } from './confirm';
import { ingestLogs, type RawLog } from './processor';

export interface ReconcileReport {
  pendingChecked: number;
  confirmed: number;
  failed: number;
  escrowsChecked: number;
  recovered: number;
  mismatches: Array<{ contractId: string; issue: string }>;
}

/** App statuses consistent with each on-chain status (for drift reporting). */
const CONSISTENT_APP_STATUS: Record<EscrowV3Status, string[]> = {
  none: ['created', 'cancelled'],
  funded: ['in_progress', 'funded'],
  submitted: ['submitted'],
  revision_requested: ['revision_requested'],
  disputed: ['disputed'],
  released: ['completed'],
  refunded: ['refunded'],
  resolved: ['completed', 'refunded'],
};

/**
 * Answers "does the database match the chain?" and repairs drift using
 * only real on-chain data:
 *
 *  1. Re-checks pending transactions (confirm / fail / drop).
 *  2. Finds escrows funded on-chain that Forj never linked (the client
 *     funded but the app never reported it) and ingests their logs.
 *  3. Reads `getEscrow` for open V3 escrows; on disagreement, re-ingests
 *     that escrow's logs, then flags whatever still disagrees.
 *
 * Chain state is authoritative for money. Nothing here writes a status the
 * chain didn't emit an event for; unresolved differences are recorded in
 * `contracts.sync_issue` and logged for alerting.
 */
export async function reconcileEscrows(
  cfg: EscrowV3Config,
  opts: { limit?: number; staleAfterMs?: number } = {},
  database: Database = defaultDb,
  client: V3Client = getV3Client(cfg),
): Promise<ReconcileReport> {
  const limit = opts.limit ?? 50;
  const report: ReconcileReport = { pendingChecked: 0, confirmed: 0, failed: 0, escrowsChecked: 0, recovered: 0, mismatches: [] };
  const address = cfg.escrowAddress.toLowerCase();

  // 1. Pending transactions.
  const pending = await database.query.escrowTransactions.findMany({
    where: and(eq(escrowTransactions.chainId, cfg.chainId), eq(escrowTransactions.status, 'pending')),
    limit,
  });
  for (const row of pending) {
    report.pendingChecked += 1;
    const outcome = await confirmEscrowTransaction(cfg, row, database, client);
    if (outcome === 'confirmed') report.confirmed += 1;
    if (outcome === 'failed') report.failed += 1;
  }

  // 2. Funded on-chain but never linked.
  const unlinked = await database.query.contracts.findMany({
    where: and(eq(contracts.status, 'created'), isNotNull(contracts.contractRef), isNull(contracts.onChainContractId)),
    with: { client: { columns: { walletAddress: true } } },
    limit,
  });
  for (const c of unlinked) {
    if (!c.client.walletAddress) continue;
    const escrowId = await client.readContract({
      address: cfg.escrowAddress,
      abi: forjEscrowV3Abi,
      functionName: 'escrowIdByRef',
      args: [c.client.walletAddress as Hex, c.contractRef as Hex],
    });
    if (escrowId === 0n) continue;
    await ingestLogs(cfg, await logsForEscrow(cfg, client, escrowId, cfg.deployBlock), database);
    report.recovered += 1;
    log('warn', 'escrow.unlinked_funding_recovered', { contractId: c.id, escrowId });
  }

  // 3. Open or stale linked escrows.
  const staleBefore = new Date(Date.now() - (opts.staleAfterMs ?? 10 * 60 * 1000));
  const linked = await database.query.contracts.findMany({
    where: and(
      eq(contracts.escrowVersion, 'v3'),
      eq(contracts.escrowContractAddress, address),
      isNotNull(contracts.onChainContractId),
      or(
        inArray(contracts.onChainStatus, ['funded', 'submitted', 'revision_requested', 'disputed']),
        isNotNull(contracts.syncIssue),
        isNull(contracts.lastReconciledAt),
      ),
      or(isNull(contracts.lastReconciledAt), lt(contracts.lastReconciledAt, staleBefore)),
    ),
    columns: { id: true, onChainContractId: true, onChainStatus: true, status: true, lastEventBlock: true },
    limit,
  });

  for (const c of linked) {
    report.escrowsChecked += 1;
    const chainStatus = await readStatus(cfg, client, BigInt(c.onChainContractId!));
    let dbStatus = c.onChainStatus;
    let appStatus = c.status;

    if (chainStatus !== dbStatus) {
      await ingestLogs(cfg, await logsForEscrow(cfg, client, BigInt(c.onChainContractId!), c.lastEventBlock ?? cfg.deployBlock), database);
      const after = await database.query.contracts.findFirst({
        where: eq(contracts.id, c.id),
        columns: { onChainStatus: true, status: true },
      });
      dbStatus = after?.onChainStatus ?? dbStatus;
      appStatus = after?.status ?? appStatus;
      if (dbStatus === chainStatus) report.recovered += 1;
    }

    let issue: string | null = null;
    if (chainStatus !== dbStatus) {
      issue = `On-chain status is "${chainStatus}" but Forj recorded "${dbStatus}".`;
    } else if (!CONSISTENT_APP_STATUS[chainStatus].includes(appStatus)) {
      issue = `Contract shows "${appStatus}" but the escrow is "${chainStatus}" on-chain.`;
    }
    await database.update(contracts).set({ syncIssue: issue, lastReconciledAt: new Date() }).where(eq(contracts.id, c.id));
    if (issue) {
      report.mismatches.push({ contractId: c.id, issue });
      log('error', 'escrow.reconcile_mismatch', { contractId: c.id, chainStatus, dbStatus, appStatus });
    }
  }

  if (report.pendingChecked || report.recovered || report.mismatches.length) {
    log('info', 'escrow.reconcile_run', { ...report, mismatches: report.mismatches.length });
  }
  return report;
}

export async function readStatus(cfg: EscrowV3Config, client: V3Client, escrowId: bigint): Promise<EscrowV3Status> {
  const e = await client.readContract({
    address: cfg.escrowAddress,
    abi: forjEscrowV3Abi,
    functionName: 'getEscrow',
    args: [escrowId],
  });
  return ESCROW_V3_STATUS[e.status] ?? 'none';
}

/**
 * All logs whose first indexed topic is this escrow id. Every V3 escrow
 * event indexes `escrowId` first, so one topic filter covers the lifecycle.
 */
async function logsForEscrow(cfg: EscrowV3Config, client: V3Client, escrowId: bigint, fromBlock: bigint): Promise<RawLog[]> {
  const latest = await client.getBlockNumber();
  const out: RawLog[] = [];
  const step = 5_000n;
  for (let from = fromBlock; from <= latest; from += step) {
    const to = from + step - 1n > latest ? latest : from + step - 1n;
    const logs = (await client.request({
      method: 'eth_getLogs',
      params: [
        {
          address: cfg.escrowAddress,
          fromBlock: toHex(from),
          toBlock: toHex(to),
          topics: [null, pad(toHex(escrowId), { size: 32 })],
        },
      ],
    })) as Array<{ address: Hex; topics: Hex[]; data: Hex; transactionHash: Hex; logIndex: Hex; blockNumber: Hex; blockHash: Hex }>;
    for (const l of logs) {
      out.push({
        address: l.address,
        topics: l.topics,
        data: l.data,
        transactionHash: l.transactionHash,
        logIndex: Number(l.logIndex),
        blockNumber: BigInt(l.blockNumber),
        blockHash: l.blockHash,
      });
    }
  }
  return out;
}
