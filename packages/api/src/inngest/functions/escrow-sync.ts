import { inngest } from '../client';
import { isEscrowV3Enabled, getEscrowV3Config, reconcileEscrows, syncEscrowLogs } from '../../escrow-v3';
import { log } from '../../lib/log';

/**
 * Keeps the database in step with ForjEscrowV3 even when nobody has the
 * contract page open: indexes new logs (confirmation-delayed), confirms or
 * fails pending transactions, recovers unlinked fundings and flags drift.
 * Each step is idempotent, so retries and overlapping runs are safe.
 */
// Inngest v4: triggers live in the options object (same as dispatch-email).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleEscrowSync = async ({ step }: any) => {
    if (!isEscrowV3Enabled()) return { skipped: 'ForjEscrowV3 not configured for this chain' };
    const indexed = await step.run('index-logs', async () => {
      const r = await syncEscrowLogs(getEscrowV3Config());
      return { ...r, lastProcessedBlock: r.lastProcessedBlock.toString() };
    });
    const reconciled = await step.run('reconcile', () => reconcileEscrows(getEscrowV3Config()));
    if (reconciled.mismatches.length > 0) {
      log('error', 'escrow.drift_detected', { count: reconciled.mismatches.length, mismatches: reconciled.mismatches });
    }
    return { indexed, reconciled };
};

export const escrowSyncFn = inngest.createFunction(
  {
    id: 'escrow-v3-sync',
    triggers: [{ cron: '*/2 * * * *' }],
    concurrency: { limit: 1 },
    retries: 2,
  },
  handleEscrowSync,
);
