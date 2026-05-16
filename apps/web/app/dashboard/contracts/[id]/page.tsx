'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useChainId } from 'wagmi';
import { useClaimRelease, useFundEscrow, useReleaseEscrow } from '@/hooks/use-escrow';
import {
  SMART_WALLETS_ENABLED,
  useFundEscrowSmart,
} from '@/hooks/use-fund-escrow-smart';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  CircleDashed,
  Coins,
  ExternalLink,
  FileText,
  HandCoins,
  MessageSquare,
  PencilLine,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Star,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Label,
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  Skeleton,
  Textarea,
  UserAvatar,
} from '@/components/ui';
import { ReviewCard, ReviewForm, type ReviewFormValue } from '@/components/reviews';
import { MilestoneTracker } from '@/components/contracts/milestone-tracker';
import {
  SubmissionFilePicker,
  type AttachedFile,
} from '@/components/contracts/submission-file-picker';
import { api } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/use-auth';
import { cn, formatUSD } from '@/lib/utils';

type ContractStatus =
  | 'created'
  | 'funded'
  | 'in_progress'
  | 'submitted'
  | 'revision_requested'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'refunded';

const STATUS_STYLE: Record<
  ContractStatus,
  { label: string; variant: 'success' | 'warning' | 'default' | 'brand' | 'error'; tone: string }
> = {
  created: {
    label: 'Awaiting funding',
    variant: 'default',
    tone: 'The client needs to fund the escrow before work begins.',
  },
  funded: {
    label: 'Funded',
    variant: 'brand',
    tone: 'Escrow is funded. Work is starting.',
  },
  in_progress: {
    label: 'In progress',
    variant: 'brand',
    tone: 'The freelancer is working on the deliverable.',
  },
  submitted: {
    label: 'Awaiting review',
    variant: 'warning',
    tone: 'The freelancer submitted work. The client should review and approve.',
  },
  revision_requested: {
    label: 'Revision requested',
    variant: 'warning',
    tone: 'The client asked for changes. Resubmit when ready.',
  },
  completed: {
    label: 'Completed',
    variant: 'success',
    tone: 'Work was approved and funds released. Nice work!',
  },
  disputed: {
    label: 'Disputed',
    variant: 'error',
    tone: 'A dispute has been raised. Funds remain locked until resolved.',
  },
  cancelled: {
    label: 'Cancelled',
    variant: 'default',
    tone: 'This contract was cancelled before funding.',
  },
  refunded: {
    label: 'Refunded',
    variant: 'default',
    tone: 'Funds were returned to the client.',
  },
};

// Ordered timeline stages — used by the status rail to show progress.
const TIMELINE: Array<{ key: ContractStatus; label: string }> = [
  { key: 'created', label: 'Created' },
  { key: 'in_progress', label: 'Funded & active' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'completed', label: 'Completed' },
];

const stageIndex = (s: ContractStatus): number => {
  if (s === 'created') return 0;
  if (s === 'funded' || s === 'in_progress' || s === 'revision_requested') return 1;
  if (s === 'submitted') return 2;
  if (s === 'completed') return 3;
  // off-track terminal states sit before "completed" visually
  if (s === 'cancelled' || s === 'disputed' || s === 'refunded') return -1;
  return 0;
};

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const contractId = params.id;

  const contractQuery = api.contract.getById.useQuery(
    { id: contractId },
    { enabled: Boolean(contractId), retry: false },
  );

  const utils = api.useUtils();
  const refreshAll = () => {
    utils.contract.getById.invalidate({ id: contractId });
    utils.contract.myContracts.invalidate();
    // After any state change (fund / submit / approve), the review gate
    // can change too: approving flips status to `completed` which makes
    // both parties eligible to review. Without this invalidate the
    // "Leave a review" CTA stays hidden until the user hard-refreshes.
    utils.review.canReview.invalidate({ contractId });
    utils.review.getByContract.invalidate({ contractId });
  };

  // ---- Reviews: gate, list, create.
  // Gate runs only after the contract is loaded *and* completed — no point
  // hitting the API while it's still in_progress. The list query is enabled
  // for any state of a completed contract, so both parties always see what's
  // already there.
  const canReviewQuery = api.review.canReview.useQuery(
    { contractId },
    { enabled: Boolean(contractId), retry: false },
  );
  const reviewsQuery = api.review.getByContract.useQuery(
    { contractId },
    { enabled: Boolean(contractId), retry: false },
  );

  const refreshReviews = () => {
    utils.review.canReview.invalidate({ contractId });
    utils.review.getByContract.invalidate({ contractId });
    // The other party's profile stats and our own list-by-user need to refresh
    // too — but those are page-scoped queries on the profile route, so we just
    // invalidate by router key and let any mounted page pick it up.
    utils.review.statsByUser.invalidate();
    utils.review.listByUser.invalidate();
  };

  const reviewMut = api.review.create.useMutation({
    onSuccess: () => {
      toast.success('Review submitted — thanks for sharing!');
      setReviewOpen(false);
      refreshReviews();
    },
    onError: (e) => toast.error(e.message),
  });

  const chainId = useChainId();
  // Fund flow has two implementations:
  //   - EOA path (`useFundEscrow`): user signs approve + fund themselves,
  //     pays gas in ETH, sees two MetaMask popups.
  //   - Smart wallet path (`useFundEscrowSmart`): batched into a single
  //     UserOperation, gas sponsored by Pimlico paymaster, one in-app
  //     confirm popup, $0 cost to user.
  //
  // The flag `SMART_WALLETS_ENABLED` flips between them. Both call sites
  // share the same `args` shape so the rest of `handleFund` stays
  // identical.
  const fundEscrowEoa = useFundEscrow();
  const fundEscrowSmart = useFundEscrowSmart();
  const fundEscrow = SMART_WALLETS_ENABLED ? fundEscrowSmart : fundEscrowEoa;
  const releaseEscrow = useReleaseEscrow();
  const claimEscrow = useClaimRelease();

  const fundMut = api.contract.fundEscrow.useMutation({
    onSuccess: () => {
      toast.success('Escrow funded — work can begin');
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const approveMut = api.contract.approveWork.useMutation({
    onSuccess: () => {
      toast.success('Work approved — funds released');
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const claimMut = api.contract.claimRelease.useMutation({
    onSuccess: () => {
      toast.success('Funds claimed — payout sent to your wallet');
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitMut = api.contract.submitWork.useMutation({
    onSuccess: () => {
      toast.success('Submission sent for review');
      setSubmitOpen(false);
      setSubmitMessage('');
      setSubmissionFiles([]);
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const revisionMut = api.contract.requestRevision.useMutation({
    onSuccess: () => {
      toast.success('Revision request sent');
      setRevisionOpen(false);
      setRevisionReason('');
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMut = api.contract.cancelContract.useMutation({
    onSuccess: () => {
      toast.success('Contract cancelled');
      setCancelOpen(false);
      setCancelReason('');
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const disputeMut = api.contract.raiseDispute.useMutation({
    onSuccess: () => {
      toast.success('Dispute raised — an arbiter will review');
      setDisputeOpen(false);
      setDisputeReason('');
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  // Modal state for the freelancer/client action dialogs
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  // Attachments are uploaded eagerly to UploadThing while the modal is open;
  // we only forward the resulting public URLs into the mutation payload.
  const [submissionFiles, setSubmissionFiles] = useState<AttachedFile[]>([]);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState('');

  const updateTermsMut = api.contract.updateTerms.useMutation({
    onSuccess: () => {
      toast.success('Delivery deadline updated');
      setDeadlineOpen(false);
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });

  /**
   * Fund handler — branches by `paymentMethod`.
   *
   * Two on-chain code paths, picked by `SMART_WALLETS_ENABLED`:
   *
   *   - **Smart wallet (sponsored)**: a SINGLE batched UserOperation
   *     does `approve(USDC) + fund(escrow)` atomically via the Privy
   *     smart-wallet client. One popup, no gas. Narration is therefore
   *     a single-stage toast — saying "Step 1 of 2" here would lie to
   *     the user about what their wallet is doing.
   *
   *   - **EOA (legacy)**: two separate transactions (approve, then
   *     fund). User pays gas, sees two wallet popups. The two-step
   *     narration applies here.
   */
  const handleFund = async () => {
    if (!contractQuery.data) return;
    const c = contractQuery.data;
    if (c.paymentMethod === 'crypto') {
      if (!c.freelancer.walletAddress) {
        toast.error(
          "The freelancer hasn't synced their wallet yet — ask them to refresh the dashboard once.",
        );
        return;
      }
      // Single sticky toast, swap its message as we move through stages.
      // Initial copy differs by flow because the smart-wallet path doesn't
      // do a separate allowance read step worth narrating.
      const tid = toast.loading(
        SMART_WALLETS_ENABLED ? 'Preparing escrow…' : 'Preparing wallet…',
        {
          description: SMART_WALLETS_ENABLED
            ? 'Building a sponsored transaction. No gas needed from you.'
            : 'Reading USDC allowance.',
        },
      );
      try {
        const result = await fundEscrow.run({
          freelancer: c.freelancer.walletAddress as `0x${string}`,
          amountUsd: c.totalAmount,
          deliveryDeadline: Math.floor(new Date(c.deliveryDeadline).getTime() / 1000),
          // Optional callback — keeps the toast informed without adding
          // another piece of state on the page. Copy differs between
          // EOA (two-step) and smart wallet (one batched user-op).
          onStageChange: (stage) => {
            if (stage === 'approving') {
              // EOA-only stage; smart wallet hook never emits this.
              toast.loading('Step 1 of 2 — approve USDC', {
                id: tid,
                description: 'Confirm in your wallet so the escrow can pull funds.',
              });
            } else if (stage === 'funding') {
              toast.loading(
                SMART_WALLETS_ENABLED
                  ? 'Confirm to lock funds'
                  : 'Step 2 of 2 — lock funds in escrow',
                {
                  id: tid,
                  description: SMART_WALLETS_ENABLED
                    ? 'One in-app confirm. Forj sponsors the gas.'
                    : 'Confirm the second wallet popup. Funds release only when you approve the work.',
                },
              );
            } else if (stage === 'confirming') {
              toast.loading('Confirming on Base…', {
                id: tid,
                description: 'Waiting for the network to mine your transaction.',
              });
            }
          },
        });
        toast.dismiss(tid);
        try {
          await fundMut.mutateAsync({
            paymentMethod: 'crypto',
            contractId: c.id,
            txHash: result.txHash,
            onChainContractId: result.onChainContractId.toString(),
            chainId,
          });
        } catch (mutErr) {
          // Critical UX gap: the on-chain tx already succeeded (USDC has
          // moved into the escrow contract) but the backend rejected the
          // record. If we just bubble the error, the user might click
          // "Fund" again and lose another $X to a duplicate escrow with
          // no DB linkage.
          //
          // Show an explicit "funds are on-chain, ask support" toast +
          // log the txHash so the user can copy it. The status flag stays
          // `success` on the hook so the Fund button stays disabled.
          const raw = mutErr instanceof Error ? mutErr.message : 'Backend rejected the fund';
          toast.error('Funds locked on-chain, but the record could not be linked.', {
            description: `tx ${result.txHash.slice(0, 14)}… escrowId ${result.onChainContractId.toString()}. ${raw}. Contact support to reconcile — do not click Fund again.`,
            duration: 60_000,
          });
          // Re-throw so the outer catch logs it.
          throw mutErr;
        }
      } catch (err) {
        toast.dismiss(tid);
        // Friendly mapping for common wallet errors.
        const raw = err instanceof Error ? err.message : 'Funding failed';
        const msg = humanizeWalletError(raw);
        toast.error(msg);
      }
    } else {
      fundMut.mutate({ paymentMethod: 'fiat', contractId: c.id });
    }
  };

  /**
   * Approve & release handler — same crypto/fiat split. The release tx
   * goes from the client's wallet so they pay gas, matching the legal
   * intent of approval ("I'm paying you").
   */
  const handleApprove = async () => {
    if (!contractQuery.data) return;
    const c = contractQuery.data;
    if (c.paymentMethod === 'crypto') {
      if (c.onChainContractId == null) {
        toast.error('No on-chain escrowId — was this contract funded as crypto?');
        return;
      }
      try {
        const txHash = await releaseEscrow.run(BigInt(c.onChainContractId));
        await approveMut.mutateAsync({
          paymentMethod: 'crypto',
          contractId: c.id,
          txHash,
          chainId,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Release failed');
      }
    } else {
      approveMut.mutate({ paymentMethod: 'fiat', contractId: c.id });
    }
  };

  /** Permissionless freelancer claim once the auto-release window has passed. */
  const handleClaim = async () => {
    if (!contractQuery.data) return;
    const c = contractQuery.data;
    if (c.onChainContractId == null) {
      toast.error('Off-chain contract — no on-chain claim available');
      return;
    }
    try {
      const txHash = await claimEscrow.run(BigInt(c.onChainContractId));
      await claimMut.mutateAsync({
        contractId: c.id,
        txHash,
        chainId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Claim failed');
    }
  };

  if (contractQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (contractQuery.isError || !contractQuery.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-10 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Contract not found
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {contractQuery.error?.message ?? 'You may not have access to this contract.'}
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            leftIcon={<ArrowLeft />}
            onClick={() => router.push('/dashboard/contracts')}
          >
            Back to contracts
          </Button>
        </div>
      </div>
    );
  }

  const contract = contractQuery.data;
  const status = contract.status as ContractStatus;
  const style = STATUS_STYLE[status];
  const isClient = user?.id === contract.clientId;
  const isFreelancer = user?.id === contract.freelancerId;
  const counterparty = isClient ? contract.freelancer : contract.client;
  const counterpartyLabel = isClient ? 'Freelancer' : 'Client';
  const stage = stageIndex(status);
  const isOffTrack = status === 'cancelled' || status === 'disputed' || status === 'refunded';

  // Action availability matrix
  const canFund = isClient && status === 'created';
  const canCancel = (isClient || isFreelancer) && status === 'created';
  const canSubmit = isFreelancer && (status === 'in_progress' || status === 'revision_requested');
  const canApprove = isClient && status === 'submitted';
  const canRequestRevision = isClient && status === 'submitted';
  const canDispute =
    (isClient || isFreelancer) &&
    (status === 'in_progress' || status === 'submitted' || status === 'revision_requested');
  // Freelancer can claim once auto-release window expired AND the contract is
  // a crypto contract (has an on-chain id). The chain itself enforces the
  // timeout; the off-chain check just hides the button until eligible.
  const canClaim =
    isFreelancer &&
    status === 'submitted' &&
    contract.onChainContractId != null &&
    contract.autoReleaseAt != null &&
    new Date(contract.autoReleaseAt).getTime() <= Date.now();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <button
        onClick={() => router.push('/dashboard/contracts')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
      >
        <ArrowLeft className="size-4" />
        Back to contracts
      </button>

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={style.variant}>{style.label}</Badge>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            Created {new Date(contract.createdAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
          {contract.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{style.tone}</p>

        {status === 'completed' ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-2 text-xs">
            <ShieldCheck className="size-3.5 text-[var(--color-brand-primary)]" />
            <span className="font-medium text-[var(--color-text-primary)]">
              This contract is now a public proof of work.
            </span>
            <Link
              href={`/proof/${contract.id}`}
              target="_blank"
              className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--color-brand-primary)] hover:underline"
            >
              <Share2 className="size-3" />
              Share proof
              <ArrowRight className="size-3" />
            </Link>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Total" value={formatUSD(contract.totalAmount)} icon={<Coins />} />
          <Stat
            label="Freelancer receives"
            value={formatUSD(contract.freelancerAmount)}
            icon={<HandCoins />}
          />
          <Stat
            label="Delivery deadline"
            value={new Date(contract.deliveryDeadline).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
            icon={<Calendar />}
          />
        </div>
      </motion.div>

      {/* Timeline */}
      {!isOffTrack ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-6 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
        >
          <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
            Progress
          </h2>
          <div className="mt-5">
            {/* Mobile: 2-up grid (4 steps in 2 rows of 2) so each cell
                has ~165px on a 375px viewport — readable. Desktop: the
                classic 4-across timeline. The connector line behaviour
                is unchanged because we still render the same number of
                items in order; the visual wrap on mobile just makes the
                second row a continuation of the first. */}
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 sm:grid-cols-4 sm:gap-y-2">
              {TIMELINE.map((step, i) => {
                const reached = stage >= i;
                const current = stage === i;
                return (
                  <div key={step.key} className="flex flex-col items-center gap-2">
                    <div className="relative flex w-full items-center">
                      <div
                        className={cn(
                          'h-1 flex-1 rounded-full',
                          i === 0 ? 'opacity-0' : reached
                            ? 'bg-[var(--color-brand-primary)]'
                            : 'bg-[var(--color-border-default)]',
                        )}
                      />
                      <div
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          reached
                            ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)]'
                            : 'border-[var(--color-border-default)] bg-[var(--color-background-tertiary)] text-[var(--color-text-tertiary)]',
                          current && 'shadow-[0_0_18px_var(--color-glow-brand)]',
                        )}
                      >
                        {reached ? <Check className="size-4" /> : <CircleDashed className="size-4" />}
                      </div>
                      <div
                        className={cn(
                          'h-1 flex-1 rounded-full',
                          i === TIMELINE.length - 1 ? 'opacity-0' : stage > i
                            ? 'bg-[var(--color-brand-primary)]'
                            : 'bg-[var(--color-border-default)]',
                        )}
                      />
                    </div>
                    <span
                      className={cn(
                        'text-center text-[11px] font-medium uppercase tracking-wide',
                        reached
                          ? 'text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-tertiary)]',
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={cn(
            'mt-6 flex items-start gap-3 rounded-[var(--radius-xl)] border p-5',
            status === 'disputed'
              ? 'border-[var(--color-error)]/40 bg-[var(--color-error)]/5'
              : 'border-[var(--color-border-default)] bg-[var(--color-background-secondary)]',
          )}
        >
          {status === 'disputed' ? (
            <ShieldAlert className="mt-0.5 size-5 text-[var(--color-error)]" />
          ) : (
            <XCircle className="mt-0.5 size-5 text-[var(--color-text-tertiary)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">{style.label}</p>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{style.tone}</p>
            {status === 'disputed' && contract.disputeReason ? (
              <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 p-3 text-sm text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-error)]">Reason:</span>{' '}
                {contract.disputeReason}
              </p>
            ) : null}
            {status === 'cancelled' && contract.cancellationReason ? (
              <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-tertiary)] p-3 text-sm text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-text-primary)]">Reason:</span>{' '}
                {contract.cancellationReason}
              </p>
            ) : null}
          </div>
        </motion.div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="flex flex-col gap-6">
          {/* Milestones tracker (Phase 7A — off-chain) */}
          {contract.milestones && contract.milestones.length > 0 ? (
            <MilestoneTracker
              contractId={contract.id}
              milestones={contract.milestones}
              isClient={isClient}
              isFreelancer={isFreelancer}
            />
          ) : null}

          {/* Latest submission, if any */}
          {contract.submissionMessage ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
            >
              <div className="flex items-center gap-2">
                <Upload className="size-4 text-[var(--color-brand-primary)]" />
                <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
                  Latest submission
                </h2>
                {contract.submittedAt ? (
                  <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">
                    {new Date(contract.submittedAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                {contract.submissionMessage}
              </p>
              {contract.submissionFiles && contract.submissionFiles.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {contract.submissionFiles.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-background-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-brand)] hover:text-[var(--color-brand-primary)]"
                    >
                      <FileText className="size-3.5" />
                      Attachment
                      <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              ) : null}
              {contract.autoReleaseAt && status === 'submitted' ? (
                <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                  <ShieldCheck className="size-3.5 text-[var(--color-warning)]" />
                  Auto-release on{' '}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {new Date(contract.autoReleaseAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </span>{' '}
                  if no action is taken.
                </div>
              ) : null}
            </motion.div>
          ) : null}

          {/* Revision banner — visible when client requested revisions */}
          {status === 'revision_requested' && contract.revisionReason ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="rounded-[var(--radius-xl)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-6"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="size-4 text-[var(--color-warning)]" />
                <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
                  Revision requested
                </h2>
                {contract.revisionCount > 0 ? (
                  <Badge variant="warning">Round {contract.revisionCount}</Badge>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                {contract.revisionReason}
              </p>
            </motion.div>
          ) : null}

          {/* Action panel */}
          {(canFund || canSubmit || canApprove || canRequestRevision || canCancel || canDispute) ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
            >
              <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
                Actions
              </h2>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                Available actions for your role on this contract.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {canFund && (
                  <Button
                    variant="ghost"
                    leftIcon={<PencilLine />}
                    onClick={() => {
                      // Pre-seed with current deadline in YYYY-MM-DD format
                      // for the native date picker.
                      const d = new Date(contract.deliveryDeadline);
                      const iso = d.toISOString().slice(0, 10);
                      setDeadlineDraft(iso);
                      setDeadlineOpen(true);
                    }}
                  >
                    Edit deadline
                  </Button>
                )}
                {canFund && (
                  <Button
                    leftIcon={<ShieldCheck />}
                    isLoading={
                      fundMut.isPending ||
                      fundEscrow.status === 'approving' ||
                      fundEscrow.status === 'funding' ||
                      fundEscrow.status === 'confirming' ||
                      fundEscrow.status === 'checking-allowance' ||
                      // CRITICAL: once the on-chain tx succeeded, the
                      // escrow is funded regardless of whether the
                      // backend DB write went through. Re-clicking would
                      // create a SECOND escrow that drains another
                      // amount+fee from the smart wallet. Lock the button
                      // until the page refreshes (which clears the hook
                      // state). The toast above tells the user to
                      // contact support.
                      fundEscrow.status === 'success'
                    }
                    onClick={handleFund}
                  >
                    {contract.paymentMethod === 'crypto' ? 'Fund USDC escrow' : 'Fund escrow'}
                  </Button>
                )}
                {canSubmit && (
                  <Button leftIcon={<Upload />} onClick={() => setSubmitOpen(true)}>
                    {status === 'revision_requested' ? 'Resubmit work' : 'Submit work'}
                  </Button>
                )}
                {canApprove && (
                  <Button
                    leftIcon={<CheckCircle2 />}
                    isLoading={
                      approveMut.isPending ||
                      releaseEscrow.status === 'releasing' ||
                      releaseEscrow.status === 'confirming'
                    }
                    onClick={handleApprove}
                  >
                    Approve &amp; release funds
                  </Button>
                )}
                {canClaim && (
                  <Button
                    variant="secondary"
                    leftIcon={<Coins />}
                    isLoading={
                      claimMut.isPending ||
                      claimEscrow.status === 'claiming' ||
                      claimEscrow.status === 'confirming'
                    }
                    onClick={handleClaim}
                  >
                    Claim funds (auto-release)
                  </Button>
                )}
                {canRequestRevision && (
                  <Button
                    variant="secondary"
                    leftIcon={<RefreshCw />}
                    onClick={() => setRevisionOpen(true)}
                  >
                    Request revision
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="ghost"
                    leftIcon={<XCircle />}
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel contract
                  </Button>
                )}
                {canDispute && (
                  <Button
                    variant="destructive"
                    leftIcon={<AlertTriangle />}
                    onClick={() => setDisputeOpen(true)}
                  >
                    Raise dispute
                  </Button>
                )}
              </div>
            </motion.div>
          ) : null}

          {/* Reviews section — visible once the contract is completed.
              Both sides see what's been written + a CTA to leave their own. */}
          {status === 'completed' ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star className="size-4 text-[var(--color-warning)]" />
                  <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
                    Reviews
                  </h2>
                  {reviewsQuery.data?.all.length ? (
                    <Badge variant="default">
                      {reviewsQuery.data.all.length} of 2
                    </Badge>
                  ) : null}
                </div>
                {canReviewQuery.data?.canReview ? (
                  <Button
                    size="sm"
                    leftIcon={<Star />}
                    onClick={() => setReviewOpen(true)}
                  >
                    Leave a review
                  </Button>
                ) : null}
              </div>

              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                Both parties can leave one review. Reviews are permanent and contribute to
                each other's WorkScore.
              </p>

              <div className="mt-5 flex flex-col gap-4">
                {reviewsQuery.isPending ? (
                  <>
                    <Skeleton className="h-32 rounded-[var(--radius-xl)]" />
                    <Skeleton className="h-32 rounded-[var(--radius-xl)]" />
                  </>
                ) : reviewsQuery.data && reviewsQuery.data.all.length > 0 ? (
                  reviewsQuery.data.all.map((r) => (
                    <ReviewCard
                      key={r.id}
                      review={r}
                      highlight={r.reviewerId === user?.id}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/30 px-6 py-10 text-center">
                    <Star className="size-6 text-[var(--color-text-tertiary)]" />
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      No reviews yet
                    </p>
                    <p className="max-w-sm text-xs text-[var(--color-text-tertiary)]">
                      Be the first to share how this collaboration went. Your review helps
                      future clients and freelancers make informed decisions.
                    </p>
                  </div>
                )}

                {/* Soft prompt for parties that already reviewed but the other
                    side hasn't — keeps the section feeling alive. */}
                {reviewsQuery.data?.mine && !reviewsQuery.data.theirs ? (
                  <p className="text-center text-xs text-[var(--color-text-tertiary)]">
                    Waiting for {counterparty.displayName ?? counterparty.username} to leave
                    their review.
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5"
          >
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {counterpartyLabel}
            </p>
            <Link
              href={counterparty.username ? `/u/${counterparty.username}` : '#'}
              className="mt-3 flex items-center gap-3 rounded-[var(--radius-md)] p-2 transition-colors hover:bg-[var(--color-text-primary)]/[0.04]"
            >
              <UserAvatar
                name={counterparty.displayName ?? counterparty.username ?? ''}
                imageUrl={counterparty.avatarUrl}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[var(--color-text-primary)]">
                  {counterparty.displayName ?? counterparty.username ?? 'User'}
                </p>
                {counterparty.username ? (
                  <p className="truncate text-xs text-[var(--color-text-tertiary)]">
                    @{counterparty.username}
                  </p>
                ) : null}
              </div>
            </Link>
            <Link
              href={`/dashboard/messages?to=${counterparty.id}`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
            >
              <MessageSquare className="size-4" />
              Message
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5"
          >
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Job
            </p>
            <Link
              href={`/jobs/${contract.job.slug}`}
              className="mt-2 flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-brand-primary)]"
            >
              <span className="line-clamp-2">{contract.job.title}</span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
            <div className="mt-4 space-y-2 text-xs text-[var(--color-text-tertiary)]">
              <Row label="Total" value={formatUSD(contract.totalAmount)} />
              <Row label="Platform fee" value={formatUSD(contract.platformFee)} />
              <Row label="Currency" value={contract.currency} />
              <Row label="Payment method" value={contract.paymentMethod} />
              {contract.fundedAt ? (
                <Row
                  label="Funded"
                  value={new Date(contract.fundedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}
                />
              ) : null}
              {contract.completedAt ? (
                <Row
                  label="Completed"
                  value={new Date(contract.completedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}
                />
              ) : null}
              {contract.escrowTxHash ? (
                <Row
                  label="Escrow tx"
                  value={<TxLink hash={contract.escrowTxHash} chainId={chainId} />}
                />
              ) : null}
              {contract.releaseTxHash ? (
                <Row
                  label="Release tx"
                  value={<TxLink hash={contract.releaseTxHash} chainId={chainId} />}
                />
              ) : null}
              {contract.onChainContractId != null ? (
                <Row
                  label="Escrow id"
                  value={
                    <span className="font-mono text-[var(--color-text-secondary)]">
                      #{contract.onChainContractId}
                    </span>
                  }
                />
              ) : null}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ---- Submit work modal ---- */}
      <Modal open={submitOpen} onOpenChange={setSubmitOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Submit your work</ModalTitle>
            <ModalDescription>
              Describe what you delivered. The client gets {7} days to review before auto-release.
            </ModalDescription>
          </ModalHeader>
          <Textarea
            value={submitMessage}
            onChange={(e) => setSubmitMessage(e.target.value)}
            rows={6}
            placeholder="Summary of what's included, links to deliverables, anything the client should know…"
            className="resize-none"
          />
          <div className="mt-3">
            <SubmissionFilePicker
              files={submissionFiles}
              onChange={setSubmissionFiles}
              disabled={submitMut.isPending}
            />
          </div>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button
              isLoading={submitMut.isPending}
              disabled={submitMessage.trim().length < 10}
              onClick={() =>
                submitMut.mutate({
                  contractId: contract.id,
                  message: submitMessage.trim(),
                  files: submissionFiles.length
                    ? submissionFiles.map((f) => f.url)
                    : undefined,
                })
              }
            >
              Submit for review
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ---- Revision modal ---- */}
      <Modal open={revisionOpen} onOpenChange={setRevisionOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Request a revision</ModalTitle>
            <ModalDescription>
              Be specific about what needs to change. The freelancer will be notified.
            </ModalDescription>
          </ModalHeader>
          <Textarea
            value={revisionReason}
            onChange={(e) => setRevisionReason(e.target.value)}
            rows={5}
            placeholder="What needs to be changed?"
            className="resize-none"
          />
          <ModalFooter>
            <Button variant="ghost" onClick={() => setRevisionOpen(false)}>Cancel</Button>
            <Button
              variant="secondary"
              isLoading={revisionMut.isPending}
              disabled={revisionReason.trim().length < 10}
              onClick={() =>
                revisionMut.mutate({
                  contractId: contract.id,
                  reason: revisionReason.trim(),
                })
              }
            >
              Send request
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ---- Cancel modal ---- */}
      <Modal open={cancelOpen} onOpenChange={setCancelOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Cancel this contract?</ModalTitle>
            <ModalDescription>
              This is only possible before escrow is funded. The job will be reopened so the client
              can pick another freelancer.
            </ModalDescription>
          </ModalHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={4}
            placeholder="Tell the other party why."
            className="resize-none"
          />
          <ModalFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep contract</Button>
            <Button
              variant="destructive"
              isLoading={cancelMut.isPending}
              disabled={cancelReason.trim().length < 10}
              onClick={() =>
                cancelMut.mutate({
                  contractId: contract.id,
                  reason: cancelReason.trim(),
                })
              }
            >
              Cancel contract
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ---- Dispute modal ---- */}
      <Modal open={disputeOpen} onOpenChange={setDisputeOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Raise a dispute</ModalTitle>
            <ModalDescription>
              Funds will stay locked in escrow until an arbiter resolves it. Use this only when
              direct discussion has failed.
            </ModalDescription>
          </ModalHeader>
          <Textarea
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            rows={6}
            placeholder="Explain what happened, what was promised, and what is in dispute."
            className="resize-none"
          />
          <ModalFooter>
            <Button variant="ghost" onClick={() => setDisputeOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              isLoading={disputeMut.isPending}
              disabled={disputeReason.trim().length < 20}
              onClick={() =>
                disputeMut.mutate({
                  contractId: contract.id,
                  reason: disputeReason.trim(),
                })
              }
            >
              Raise dispute
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ---- Edit deadline modal (client, pre-funding only) ---- */}
      <Modal open={deadlineOpen} onOpenChange={setDeadlineOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Adjust delivery deadline</ModalTitle>
            <ModalDescription>
              The deadline gets locked into the on-chain escrow at funding time. After
              funding it can't be changed without raising a dispute.
            </ModalDescription>
          </ModalHeader>
          <div>
            <Label htmlFor="deadline-input">New deadline</Label>
            <Input
              id="deadline-input"
              type="date"
              value={deadlineDraft}
              min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              onChange={(e) => setDeadlineDraft(e.target.value)}
              className="mt-1.5"
            />
            <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
              Pick any date up to one year out.
            </p>
          </div>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setDeadlineOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={updateTermsMut.isPending}
              disabled={!deadlineDraft}
              onClick={() => {
                if (!deadlineDraft) return;
                updateTermsMut.mutate({
                  contractId: contract.id,
                  deliveryDeadline: new Date(deadlineDraft),
                });
              }}
            >
              Save deadline
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ---- Review modal ----
          Larger size to fit the rating + breakdown + textarea comfortably.
          The form clears its own state on success, but we mount with key on
          the contract id so re-opening on a different contract starts fresh. */}
      <Modal open={reviewOpen} onOpenChange={setReviewOpen}>
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>Leave a review</ModalTitle>
            <ModalDescription>
              Share how this collaboration went. Your review is permanent and contributes
              to {counterparty.displayName ?? counterparty.username ?? 'their'} WorkScore.
            </ModalDescription>
          </ModalHeader>
          <ReviewForm
            key={contract.id}
            isSubmitting={reviewMut.isPending}
            revieweeName={counterparty.displayName ?? counterparty.username ?? undefined}
            onSubmit={async (value: ReviewFormValue) => {
              await reviewMut.mutateAsync({
                contractId: contract.id,
                rating: value.rating,
                comment: value.comment,
                ratingBreakdown: value.ratingBreakdown,
                isPublic: value.isPublic,
              });
            }}
          />
        </ModalContent>
      </Modal>
    </div>
  );
}

/**
 * Map raw wallet / RPC errors into something a non-crypto user can act on.
 * Keeps the toast text actionable rather than showing "user rejected
 * action: User denied transaction signature" raw to the user.
 */
function humanizeWalletError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('user rejected') || m.includes('user denied')) {
    return 'You cancelled the wallet popup. Click the button again when ready.';
  }
  // Decode the most common revert: USDC.transferFrom failing because the
  // smart wallet doesn't hold enough USDC for amount + 5% client fee.
  // The raw error from viem/Pimlico is hex-encoded so users see a wall
  // of zeros — translate to a sentence that points them at the fix.
  if (
    m.includes('transfer amount exceeds balance') ||
    m.includes('45524332303a207472616e7366657220616d6f756e74')
  ) {
    return "Not enough USDC in your smart wallet. Top up at Settings → Top up your wallet, then retry.";
  }
  if (m.includes('insufficient funds') || m.includes('exceeds the balance')) {
    return "Wallet doesn't have enough ETH to pay for gas. With smart wallets, Forj sponsors gas — restart the dev server or contact support.";
  }
  if (m.includes('insufficient allowance')) {
    return "USDC approval missing. Try Fund again — it will re-approve the right amount.";
  }
  if (m.includes('nonce') || m.includes('replacement')) {
    return 'Wallet has a stuck transaction. In MetaMask: Settings → Advanced → Reset account, then retry.';
  }
  if (m.includes('chain') || m.includes('network')) {
    return 'Wrong network. Switch your wallet to Base (or Base Sepolia for testnet) and retry.';
  }
  if (m.includes('invalidstatus') || m.includes('notclient') || m.includes('notfreelancer')) {
    return 'Action not allowed at this contract stage. Refresh the page to see the current state.';
  }
  if (m.includes('invaliddeadline')) {
    return "The delivery deadline is in the past. Edit it from the contract page, then retry.";
  }
  if (m.includes('reverted')) {
    return "On-chain transaction reverted. The most common cause is insufficient USDC — top up at Settings, then retry.";
  }
  return raw.length > 200 ? 'Wallet action failed. See browser console for the technical details.' : raw;
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-tertiary)]/50 px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)] [&_svg]:size-4">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {label}
        </p>
        <p className="truncate font-semibold text-[var(--color-text-primary)]">{value}</p>
      </div>
    </div>
  );
}

/**
 * Opens the tx on the right Basescan flavor for the active chain.
 * Falls back to a plain mono span if we're on an unknown chain.
 */
function TxLink({ hash, chainId }: { hash: string; chainId: number }) {
  const explorer =
    chainId === 8453
      ? 'https://basescan.org/tx/'
      : chainId === 84532
        ? 'https://sepolia.basescan.org/tx/'
        : null;
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  if (!explorer) {
    return <span className="font-mono text-[var(--color-text-secondary)]">{short}</span>;
  }
  return (
    <a
      href={`${explorer}${hash}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[var(--color-brand-primary)] hover:underline"
    >
      {short}
      <ExternalLink className="size-3" />
    </a>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="font-medium text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl">
      <Skeleton className="mb-6 h-5 w-32 rounded" />
      <Skeleton className="h-40 rounded-[var(--radius-xl)]" />
      <Skeleton className="mt-6 h-28 rounded-[var(--radius-xl)]" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-64 rounded-[var(--radius-xl)]" />
        <Skeleton className="h-64 rounded-[var(--radius-xl)]" />
      </div>
    </div>
  );
}
