import { db as defaultDb, eq, indexerCursors } from '@forj/db';
import type { Database } from '@forj/db';
import { log } from '../lib/log';
import { getV3Client, type EscrowV3Config, type V3Client } from './config';
import { ingestLogs, type RawLog } from './processor';

/**
 * Pull every log of the V3 contract from the last processed block up to
 * `head - confirmations`, in bounded chunks, and ingest them.
 *
 * Staying `confirmations` blocks behind head avoids indexing logs that a
 * shallow reorg could remove. Ingestion is idempotent, so a crash between
 * ingest and cursor update just replays the same range next run.
 */
export async function syncEscrowLogs(
  cfg: EscrowV3Config,
  opts: { chunkSize?: bigint; maxChunks?: number } = {},
  database: Database = defaultDb,
  client: V3Client = getV3Client(cfg),
) {
  const chunkSize = opts.chunkSize ?? 5_000n;
  const maxChunks = opts.maxChunks ?? 20;
  const key = `${cfg.chainId}:${cfg.escrowAddress.toLowerCase()}`;

  const cursor = await database.query.indexerCursors.findFirst({ where: eq(indexerCursors.key, key) });
  let from = cursor ? cursor.lastProcessedBlock + 1n : cfg.deployBlock;
  const head = (await client.getBlockNumber()) - cfg.confirmations;

  let chunks = 0;
  let inserted = 0;
  let applied = 0;
  while (from <= head && chunks < maxChunks) {
    const to = from + chunkSize - 1n > head ? head : from + chunkSize - 1n;
    const logs = (await client.getLogs({ address: cfg.escrowAddress, fromBlock: from, toBlock: to })) as RawLog[];
    const result = await ingestLogs(cfg, logs, database);
    inserted += result.inserted;
    applied += result.applied;
    await database
      .insert(indexerCursors)
      .values({ key, lastProcessedBlock: to })
      .onConflictDoUpdate({ target: indexerCursors.key, set: { lastProcessedBlock: to, updatedAt: new Date() } });
    from = to + 1n;
    chunks += 1;
  }

  const lagging = head - from + 1n;
  if (inserted > 0 || lagging > 0n) {
    log('info', 'escrow.indexer_run', { chainId: cfg.chainId, inserted, applied, chunks, lastBlock: from - 1n, remainingBlocks: lagging > 0n ? lagging : 0n });
  }
  return { inserted, applied, lastProcessedBlock: from - 1n, caughtUp: from > head };
}
