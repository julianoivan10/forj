import type { StatusKind } from '@/components/ui/status';

type ContractLike = {
  status: string;
  escrowVersion?: 'v2' | 'v3' | null;
  onChainStatus?: string | null;
  onChainContractId?: number | null;
  syncIssue?: string | null;
};

const ONCHAIN_TO_KIND: Record<string, StatusKind> = {
  funded: 'funded',
  submitted: 'submitted',
  revision_requested: 'revision',
  disputed: 'disputed',
  released: 'released',
  refunded: 'refunded',
  resolved: 'resolved',
};

const APP_TO_KIND: Record<string, StatusKind> = {
  created: 'unfunded',
  funded: 'funded',
  in_progress: 'funded',
  submitted: 'submitted',
  revision_requested: 'revision',
  completed: 'completed',
  disputed: 'disputed',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

/**
 * The lifecycle status to show for a contract.
 *
 * V3 escrows show the on-chain mirror only: a database-only state is never
 * presented as if the chain had confirmed it. Before funding (or for legacy
 * v2 rows, whose chain state isn't tracked) the application status is used.
 */
export function lifecycleKind(c: ContractLike): StatusKind {
  if (c.escrowVersion === 'v3' && c.onChainStatus && c.onChainStatus !== 'none') {
    return ONCHAIN_TO_KIND[c.onChainStatus] ?? 'funded';
  }
  return APP_TO_KIND[c.status] ?? 'unfunded';
}

/** True when the lifecycle comes from confirmed chain events rather than app records. */
export function isChainBacked(c: ContractLike): boolean {
  return c.escrowVersion === 'v3' && Boolean(c.onChainStatus) && c.onChainStatus !== 'none';
}

/** Active = money is (or is about to be) held and work is still moving. */
export function isActiveContract(c: ContractLike): boolean {
  const k = lifecycleKind(c);
  return k === 'unfunded' || k === 'funded' || k === 'submitted' || k === 'revision' || k === 'disputed';
}

export function hasSyncIssue(c: ContractLike): boolean {
  return Boolean(c.syncIssue);
}
