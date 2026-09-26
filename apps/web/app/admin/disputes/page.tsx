'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Gavel,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import { useChainId } from 'wagmi';
import { parseUnits } from 'viem';
import {
  Badge,
  Button,
  Input,
  Label,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Skeleton,
  UserAvatar,
} from '@/components/ui';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@forj/api';
import { api } from '@/lib/trpc/client';
import { useResolveDispute } from '@/hooks/use-escrow';
import { V3ResolveModal } from '@/components/admin/v3-resolve-modal';
import { formatUSD } from '@/lib/utils';

/**
 * Arbiter dashboard — list every disputed contract platform-wide and resolve
 * them via on-chain `resolveDispute()`. The page itself is intentionally
 * NOT linked from the user-facing nav: only the registered registry owner
 * can actually resolve, so the URL is the access control. The on-chain
 * `onlyOwner` modifier is the *real* gate.
 *
 * Layout:
 *   - Top: small header explaining the page
 *   - Body: list of disputed contracts. Each card shows parties, total,
 *     dispute reason, and a Resolve CTA.
 *   - Modal: split form. Three numeric inputs (in USD), validated to sum
 *     to the contract total. Convert to USDC base units before signing.
 */
type Disputed = inferRouterOutputs<AppRouter>['admin']['listDisputed'][number];

export default function AdminDisputesPage() {
  const list = api.admin.listDisputed.useQuery();
  const utils = api.useUtils();
  const chainId = useChainId();
  const resolve = useResolveDispute();

  const recordMut = api.admin.recordResolution.useMutation({
    onSuccess: () => {
      toast.success('Resolution recorded — funds distributed');
      utils.admin.listDisputed.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [active, setActive] = useState<Disputed | null>(null);

  const handleResolve = async (
    contract: Disputed,
    splits: { freelancer: string; client: string; fee: string },
  ) => {
    if (contract.onChainContractId == null) {
      toast.error('Contract has no on-chain id');
      return;
    }
    try {
      const toFreelancer = parseUnits(splits.freelancer || '0', 6);
      const toClient = parseUnits(splits.client || '0', 6);
      const toFee = parseUnits(splits.fee || '0', 6);

      const txHash = await resolve.run({
        escrowId: BigInt(contract.onChainContractId),
        toFreelancer,
        toClient,
        toFee,
      });
      await recordMut.mutateAsync({
        contractId: contract.id,
        txHash,
        chainId,
      });
      setActive(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resolution failed');
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-error)]/10">
          <Scale className="size-5 text-[var(--color-error)]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Dispute resolution
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Sign on-chain splits as the registry arbiter. Only the registered owner
            can execute — others will see their wallet revert.
          </p>
        </div>
      </div>

      <div className="mt-8">
        {list.isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorBox message={list.error.message} onRetry={() => list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyBox />
        ) : (
          <div className="flex flex-col gap-4">
            {list.data.map((c, i) => (
              <DisputeCard
                key={c.id}
                contract={c}
                index={i}
                onResolve={() => setActive(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* V3 escrows: bounded share-based resolution; v2: legacy three-way split. */}
      <V3ResolveModal
        contract={active?.escrowVersion === 'v3' ? active : null}
        onClose={() => setActive(null)}
        onDone={() => {
          setActive(null);
          utils.admin.listDisputed.invalidate();
        }}
      />
      <ResolveModal
        contract={active?.escrowVersion === 'v3' ? null : active}
        onClose={() => setActive(null)}
        onSubmit={handleResolve}
        isSubmitting={resolve.status === 'releasing' || resolve.status === 'confirming' || recordMut.isPending}
      />
    </div>
  );
}

function DisputeCard({
  contract,
  index,
  onResolve,
}: {
  contract: Disputed;
  index: number;
  onResolve: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-background-secondary)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="error">Disputed</Badge>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              Updated {new Date(contract.updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <Link
            href={`/dashboard/contracts/${contract.id}`}
            className="mt-2 block truncate font-display text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-brand-primary)]"
          >
            {contract.title}
            <ArrowRight className="ml-1.5 inline-block size-3.5 align-baseline" />
          </Link>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <PartyChip
              label="Client"
              name={contract.client.displayName ?? contract.client.username ?? 'User'}
              avatar={null}
              wallet={contract.client.walletAddress}
            />
            <PartyChip
              label="Freelancer"
              name={contract.freelancer.displayName ?? contract.freelancer.username ?? 'User'}
              avatar={null}
              wallet={contract.freelancer.walletAddress}
            />
            <div className="text-[var(--color-text-secondary)]">
              <span className="text-[var(--color-text-tertiary)]">Total: </span>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {formatUSD(contract.totalAmount)}
              </span>
            </div>
            {contract.onChainContractId != null ? (
              <div className="text-[var(--color-text-secondary)]">
                <span className="text-[var(--color-text-tertiary)]">Escrow id: </span>
                <span className="font-mono text-[var(--color-text-primary)]">
                  #{contract.onChainContractId}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="shrink-0">
          <Button leftIcon={<Gavel />} onClick={onResolve}>
            Resolve
          </Button>
        </div>
      </div>

      {contract.disputeReason ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-error)]">
            Dispute reason
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
            {contract.disputeReason}
          </p>
        </div>
      ) : null}
    </motion.div>
  );
}

function PartyChip({
  label,
  name,
  avatar,
  wallet,
}: {
  label: string;
  name: string;
  avatar: string | null;
  wallet: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <UserAvatar name={name} imageUrl={avatar} size="sm" />
      <div className="text-xs">
        <p className="text-[var(--color-text-tertiary)]">{label}</p>
        <p className="truncate font-medium text-[var(--color-text-primary)]">{name}</p>
        {wallet ? (
          <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            {wallet.slice(0, 6)}…{wallet.slice(-4)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Resolution modal — three numeric inputs that must sum exactly to the
 * contract total. We validate on the client so the on-chain split-mismatch
 * revert never surprises the arbiter.
 */
function ResolveModal({
  contract,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  contract: Disputed | null;
  onClose: () => void;
  onSubmit: (
    contract: Disputed,
    splits: { freelancer: string; client: string; fee: string },
  ) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [freelancer, setFreelancer] = useState('');
  const [client, setClient] = useState('');
  const [fee, setFee] = useState('');

  // Reset whenever modal opens with a different contract
  // (keyed by contract.id externally would also work).
  if (contract && freelancer === '' && client === '' && fee === '') {
    // first render — leave empty
  }

  const total = contract ? Number(contract.totalAmount) : 0;
  const sum =
    (Number(freelancer) || 0) + (Number(client) || 0) + (Number(fee) || 0);
  const matches = Math.abs(sum - total) < 0.005;
  const ready = contract != null && sum > 0 && matches;

  const reset = () => {
    setFreelancer('');
    setClient('');
    setFee('');
  };

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    onClose();
  };

  return (
    <Modal open={contract != null} onOpenChange={(open) => !open && handleClose()}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>Resolve dispute</ModalTitle>
          <ModalDescription>
            Split the locked USDC. Numbers are USD amounts (1 USDC = 1 USD). Sum must
            equal the contract total exactly — the chain enforces this.
          </ModalDescription>
        </ModalHeader>

        {contract ? (
          <>
            <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-3 text-sm">
              <p className="font-medium text-[var(--color-text-primary)]">{contract.title}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                Total in escrow:{' '}
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {formatUSD(contract.totalAmount)}
                </span>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <SplitInput
                id="toFreelancer"
                label="Freelancer"
                value={freelancer}
                onChange={setFreelancer}
                hint="Paid out to the freelancer"
              />
              <SplitInput
                id="toClient"
                label="Client refund"
                value={client}
                onChange={setClient}
                hint="Returned to the client"
              />
              <SplitInput
                id="toFee"
                label="Platform fee"
                value={fee}
                onChange={setFee}
                hint="Withheld for arbitration"
              />
            </div>

            <div
              className={`mt-4 flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2.5 text-sm ${
                matches
                  ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/5 text-[var(--color-success)]'
                  : 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 text-[var(--color-warning)]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {matches ? <Scale className="size-4" /> : <AlertTriangle className="size-4" />}
                {matches ? 'Split matches contract total' : 'Split must sum to total'}
              </span>
              <span className="font-mono">
                ${sum.toFixed(2)} / ${total.toFixed(2)}
              </span>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/40 p-3 text-xs text-[var(--color-text-secondary)]">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
              <p>
                Your wallet must be the registry owner. If it isn't, the on-chain
                tx will revert and no funds will move.
              </p>
            </div>

            <ModalFooter>
              <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                leftIcon={<Gavel />}
                disabled={!ready || isSubmitting}
                isLoading={isSubmitting}
                onClick={() => onSubmit(contract, { freelancer, client, fee })}
              >
                Sign &amp; record
              </Button>
            </ModalFooter>
          </>
        ) : null}
      </ModalContent>
    </Modal>
  );
}

function SplitInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5"
        placeholder="0.00"
      />
      <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{hint}</p>
    </div>
  );
}

function EmptyBox() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
        <Scale className="size-6 text-[var(--color-text-tertiary)]" />
      </div>
      <h3 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
        No active disputes
      </h3>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
        Quiet on the docket. Disputes will appear here when either party
        raises one on a contract.
      </p>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-6 py-12 text-center">
      <AlertTriangle className="size-6 text-[var(--color-error)]" />
      <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
