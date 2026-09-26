'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { formatUnits, parseUnits } from 'viem';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import type { AppRouter } from '@forj/api';
import type { inferRouterOutputs } from '@trpc/server';
import { DEFAULT_CLIENT_FEE_BPS, DEFAULT_FREELANCER_FEE_BPS } from '@forj/contracts';
import {
  Button,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Textarea,
} from '@/components/ui';
import { SubmissionFilePicker, type AttachedFile } from '@/components/contracts/submission-file-picker';
import { ACTION_LABEL, EscrowRecord, buildRecordRows, stamp } from '@/components/contracts/escrow-record';
import { STAGE_COPY, useEscrowV3, type EscrowV3Action } from '@/hooks/use-escrow-v3';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { humanizeWalletError } from '@/lib/wallet-errors';

type Contract = inferRouterOutputs<AppRouter>['contract']['getById'];
type OnChain = Contract['onChainStatus'];

const NETWORK_NAME: Record<number, string> = { 8453: 'Base', 84532: 'Base Sepolia' };
const TERMINAL: OnChain[] = ['released', 'refunded', 'resolved'];

const usdc = (units: bigint) =>
  Number(formatUnits(units, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

type Action = {
  action: EscrowV3Action;
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
  note: string;
  needs?: 'submit' | 'reason';
};

/** The escrow actions this viewer can take right now, mirroring ForjEscrowV3's rules. */
export function availableActions(contract: Contract, isClient: boolean, isFreelancer: boolean, hasPending: boolean): Action[] {
  const onChain = contract.onChainStatus;
  if (hasPending || TERMINAL.includes(onChain)) return [];
  const amount = parseUnits(String(contract.totalAmount), 6);
  const clientFee = (amount * BigInt(DEFAULT_CLIENT_FEE_BPS)) / 10_000n;
  const freelancerFee = (amount * BigInt(DEFAULT_FREELANCER_FEE_BPS)) / 10_000n;
  const now = Date.now();
  const past = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() < now : false);
  const workPassed = past(contract.workDeadlineAt);
  const reviewPassed = past(contract.reviewDeadlineAt);
  const disputePassed = past(contract.disputeDeadlineAt);
  const revisionsLeft = (contract.onChainMaxRevisions ?? 0) - contract.onChainRevisionCount;

  const out: Action[] = [];
  if (isClient) {
    if (onChain === 'none' && contract.status === 'created') {
      out.push({ action: 'fund', label: 'Fund escrow', tone: 'primary', note: `Locks ${usdc(amount + clientFee)} USDC (amount plus ${DEFAULT_CLIENT_FEE_BPS / 100}% fee) in the escrow contract.` });
    }
    if (onChain === 'submitted' && !reviewPassed) {
      out.push({ action: 'release', label: 'Approve and release', tone: 'primary', note: `Pays the freelancer ${usdc(amount - freelancerFee)} USDC.` });
      if (revisionsLeft > 0) {
        out.push({ action: 'request_revision', label: `Request revision · ${revisionsLeft} left`, tone: 'secondary', note: 'Sends the work back with your notes.', needs: 'reason' });
      }
      out.push({ action: 'raise_dispute', label: 'Open dispute', tone: 'danger', note: 'Freezes the escrow until the arbiter decides.', needs: 'reason' });
    }
    if (onChain === 'submitted' && reviewPassed) {
      out.push({ action: 'release', label: 'Release payment', tone: 'primary', note: 'The review window has ended; the freelancer can also claim.' });
    }
    if (onChain === 'funded' || onChain === 'revision_requested') {
      out.push({ action: 'release', label: 'Release early', tone: 'secondary', note: 'Pay now without waiting for delivery.' });
      if (workPassed) {
        out.push({ action: 'refund_after_deadline', label: 'Refund: deadline missed', tone: 'danger', note: 'No delivery arrived in time. Returns your full deposit.' });
      }
    }
  }
  if (isFreelancer) {
    if ((onChain === 'funded' || onChain === 'revision_requested') && !workPassed) {
      out.push({ action: 'submit_work', label: onChain === 'funded' ? 'Submit work' : 'Resubmit work', tone: 'primary', note: 'Starts the client’s review window.', needs: 'submit' });
    }
    if (onChain === 'revision_requested' && !workPassed) {
      out.push({ action: 'raise_dispute', label: 'Dispute this revision', tone: 'danger', note: 'Freezes the escrow until the arbiter decides.', needs: 'reason' });
    }
    if (onChain === 'submitted' && reviewPassed) {
      out.push({ action: 'release_after_review', label: 'Claim payment', tone: 'primary', note: 'The client did not decide within the review window.' });
    }
    if (onChain === 'funded' || onChain === 'submitted' || onChain === 'revision_requested') {
      out.push({ action: 'cancel_by_freelancer', label: 'Cancel and refund client', tone: 'danger', note: 'Returns the full deposit to the client. Cannot be undone.' });
    }
  }
  if ((isClient || isFreelancer) && onChain === 'disputed' && disputePassed) {
    out.push({ action: 'resolve_expired_dispute', label: 'Apply default split', tone: 'secondary', note: 'The arbiter missed the deadline: 50/50, no platform fee.' });
  }
  return out;
}

/** What the viewer is waiting for when they have nothing to do. */
function waitingCopy(c: Contract, isClient: boolean): string {
  switch (c.onChainStatus) {
    case 'none':
      return isClient ? 'Fund the escrow to start the work.' : 'Waiting for the client to fund the escrow. Don’t start until it is funded.';
    case 'funded':
      return isClient ? `Waiting for delivery, due ${stamp(c.workDeadlineAt ?? c.deliveryDeadline)}.` : 'Deliver before the deadline.';
    case 'submitted':
      return isClient ? 'Review the delivery.' : `Waiting for the client’s decision, due ${stamp(c.reviewDeadlineAt)}.`;
    case 'revision_requested':
      return isClient ? `Waiting for the resubmission, due ${stamp(c.workDeadlineAt)}.` : 'Resubmit before the deadline.';
    case 'disputed':
      return `The arbiter decides by ${stamp(c.disputeDeadlineAt)}.`;
    case 'released':
      return 'Settled: paid to the freelancer.';
    case 'refunded':
      return 'Settled: the deposit went back to the client.';
    case 'resolved':
      return 'Settled by the dispute decision.';
    default:
      return '';
  }
}

/**
 * ForjEscrowV3 contract workspace. Left: the escrow record (the signature
 * view). Right, sticky on desktop: the next step and the terms. On mobile
 * the next step comes first, then the record, then the terms.
 */
export function EscrowV3Workspace({
  contract,
  isClient,
  isFreelancer,
  onChanged,
  preActions,
  mainAfter,
  asideAfter,
}: {
  contract: Contract;
  isClient: boolean;
  isFreelancer: boolean;
  onChanged: () => void;
  /** Off-chain actions before funding (edit terms, cancel). */
  preActions?: React.ReactNode;
  mainAfter?: React.ReactNode;
  asideAfter?: React.ReactNode;
}) {
  const escrow = useEscrowV3();
  const utils = api.useUtils();
  const activity = api.escrow.activity.useQuery({ contractId: contract.id }, { refetchOnWindowFocus: true });
  const sync = api.escrow.syncTransaction.useMutation();

  const explorer = escrow.config?.enabled ? escrow.config.explorer : 'https://sepolia.basescan.org';
  const chainId = contract.chainId ?? (escrow.config?.enabled ? escrow.config.chainId : 84532);
  const network = NETWORK_NAME[chainId] ?? `chain ${chainId}`;
  const txs = activity.data?.transactions ?? [];
  const events = useMemo(
    () => [...(activity.data?.events ?? [])].sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber)),
    [activity.data?.events],
  );
  const pendingTx = txs.find((t) => t.status === 'pending');

  // Poll a pending transaction until the server sees it confirmed or failed.
  useEffect(() => {
    if (!pendingTx) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await sync.mutateAsync({ transactionId: pendingTx.id });
        if (stopped) return;
        if (r.status !== 'pending') {
          if (r.status === 'confirmed') toast.success(`${ACTION_LABEL[pendingTx.action]}: confirmed on ${network}`);
          else toast.error(r.failureReason ?? 'The transaction failed.');
          await utils.escrow.activity.invalidate({ contractId: contract.id });
          onChanged();
        }
      } catch {
        // transient: next tick retries
      }
    };
    const id = setInterval(tick, 4000);
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTx?.id]);

  const actions = availableActions(contract, isClient, isFreelancer, Boolean(pendingTx));
  const rows = buildRecordRows(contract, events, txs, contract.client.walletAddress);

  const [modal, setModal] = useState<null | (Omit<Action, 'needs'> & { needs: 'submit' | 'reason' | 'confirm' })>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);

  const run = async (action: EscrowV3Action) => {
    try {
      const metadata =
        modal?.needs === 'submit'
          ? { message: text.trim(), files: files.length ? files.map((f) => f.url) : undefined }
          : modal?.needs === 'reason'
            ? { reason: text.trim() }
            : undefined;
      const result =
        action === 'fund'
          ? await escrow.fund(contract.id)
          : await escrow.act(action, { contractId: contract.id, escrowId: contract.onChainContractId!, metadata });
      setModal(null);
      setText('');
      setFiles([]);
      if (result.outcome === 'confirmed') toast.success(`${ACTION_LABEL[action]}: confirmed on ${network}`);
      else if (result.outcome === 'failed') toast.error(result.transaction.failureReason ?? 'The transaction failed.');
      else toast.message('Transaction sent', { description: `Waiting for ${network} to confirm it.` });
      await utils.escrow.activity.invalidate({ contractId: contract.id });
      onChanged();
    } catch (err) {
      toast.error(humanizeWalletError(err instanceof Error ? err.message : String(err)));
    }
  };

  const nextStep = (
    <NextStep
      role={isClient ? 'client' : isFreelancer ? 'freelancer' : 'viewer'}
      actions={actions}
      busy={escrow.busy}
      busyCopy={escrow.busy ? STAGE_COPY[escrow.stage] : null}
      pending={pendingTx ? { label: ACTION_LABEL[pendingTx.action] ?? pendingTx.action, href: `${explorer}/tx/${pendingTx.txHash}`, network } : null}
      waiting={waitingCopy(contract, isClient)}
      onAction={(a) => {
        setText('');
        setModal({ ...a, needs: a.needs ?? 'confirm' });
      }}
      preActions={preActions}
    />
  );

  const terms = <EscrowTerms contract={contract} explorer={explorer} network={network} />;

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-12">
        <div className="lg:hidden [&>section]:border-t-0 [&>section]:pt-0">{nextStep}</div>

        <div className="min-w-0 space-y-12 lg:col-span-8">
          <section aria-labelledby="record-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border-default)] pb-3">
              <h2 id="record-heading" className="label-mono text-[var(--color-text-primary)]">
                Escrow record
              </h2>
              <p className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                Only confirmed rows come from {network}
              </p>
            </div>
            <div className="mt-6" aria-live="polite">
              {activity.isPending ? (
                <p className="text-sm text-[var(--color-text-tertiary)]">Reading the escrow record…</p>
              ) : (
                <EscrowRecord rows={rows} explorer={explorer} network={network} />
              )}
            </div>
          </section>
          {mainAfter}
          <div className="space-y-10 lg:hidden">
            {terms}
            {asideAfter}
          </div>
        </div>

        <aside className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-20 space-y-10">
            {nextStep}
            {terms}
            {asideAfter}
          </div>
        </aside>
      </div>

      <Modal open={modal != null} onOpenChange={(open) => !open && !escrow.busy && setModal(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{modal?.label}</ModalTitle>
            <ModalDescription>
              {modal?.note} This needs a transaction on {network}. Forj updates the contract only after the network confirms it.
            </ModalDescription>
          </ModalHeader>
          {modal?.needs === 'submit' || modal?.needs === 'reason' ? (
            <label className="block">
              <span className="label-mono">{modal.needs === 'submit' ? 'Delivery note' : 'Reason'}</span>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder={modal.needs === 'submit' ? 'What you delivered and where to find it…' : 'Explain what needs to change, as specifically as you can…'}
                className="mt-1.5 resize-none"
              />
            </label>
          ) : null}
          {modal?.needs === 'submit' ? (
            <div className="mt-3">
              <SubmissionFilePicker files={files} onChange={setFiles} disabled={escrow.busy} />
            </div>
          ) : null}
          {escrow.busy ? (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {STAGE_COPY[escrow.stage]}
            </p>
          ) : null}
          <ModalFooter>
            <Button variant="ghost" disabled={escrow.busy} onClick={() => setModal(null)}>
              Back
            </Button>
            <Button
              isLoading={escrow.busy}
              disabled={escrow.busy || ((modal?.needs === 'submit' || modal?.needs === 'reason') && text.trim().length < 10)}
              onClick={() => modal && run(modal.action)}
            >
              Continue in wallet
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export function NextStep({
  role,
  actions,
  busy,
  busyCopy,
  pending,
  waiting,
  onAction,
  preActions,
}: {
  role: 'client' | 'freelancer' | 'viewer';
  actions: Action[];
  busy: boolean;
  busyCopy: string | null;
  pending: { label: string; href: string; network: string } | null;
  waiting: string;
  onAction: (a: Action) => void;
  preActions?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="next-step" className="border-t-2 border-[var(--color-rule)] pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="next-step" className="label-mono text-[var(--color-text-primary)]">
          Next step
        </h2>
        <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
          {role === 'viewer' ? 'Read only' : `You are the ${role}`}
        </span>
      </div>

      {pending ? (
        <div role="status" className="mt-4 border border-dashed border-[var(--color-warning)]/60 bg-[var(--color-warning)]/[0.06] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <Loader2 className="size-4 animate-spin text-[var(--color-warning)]" aria-hidden />
            {pending.label}: waiting for {pending.network}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Nothing is final until it’s confirmed. You can leave this page.{' '}
            <a href={pending.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
              View transaction <ArrowUpRight className="size-3" aria-hidden />
            </a>
          </p>
        </div>
      ) : null}

      {!pending && busyCopy ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {busyCopy}
        </p>
      ) : null}

      {actions.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {actions.map((a) => (
            <li key={a.action + a.label}>
              <Button
                variant={a.tone === 'primary' ? 'primary' : a.tone === 'danger' ? 'destructive' : 'secondary'}
                size="lg"
                disabled={busy}
                className="w-full justify-between"
                onClick={() => onAction(a)}
              >
                {a.label}
                <span className="font-mono text-[10px] font-normal uppercase tracking-[0.08em] opacity-80">Wallet</span>
              </Button>
              <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">{a.note}</p>
            </li>
          ))}
        </ul>
      ) : !pending ? (
        <p className="mt-4 text-[15px] text-[var(--color-text-primary)]">{waiting}</p>
      ) : null}

      {preActions ? <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">{preActions}</div> : null}
    </section>
  );
}

export function EscrowTerms({ contract, explorer, network }: { contract: Contract; explorer: string; network: string }) {
  const amount = parseUnits(String(contract.totalAmount), 6);
  const clientFee = (amount * BigInt(DEFAULT_CLIENT_FEE_BPS)) / 10_000n;
  const freelancerFee = (amount * BigInt(DEFAULT_FREELANCER_FEE_BPS)) / 10_000n;
  const addr = (a: string | null | undefined, label?: string) =>
    a ? (
      <a href={`${explorer}/address/${a}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-mono text-xs underline decoration-[var(--color-border-strong)] underline-offset-2 hover:decoration-[var(--color-brand-primary)]">
        {label ?? short(a)}
        <ArrowUpRight className="size-3" aria-hidden />
      </a>
    ) : (
      <span className="text-[var(--color-text-tertiary)]">—</span>
    );

  const rows: Array<[string, React.ReactNode]> = [
    ['Network', network],
    [
      'Escrow',
      contract.escrowContractAddress ? (
        <span>
          {addr(contract.escrowContractAddress)}
          {contract.onChainContractId != null ? <span className="ml-1.5 font-mono text-xs text-[var(--color-text-tertiary)]">#{contract.onChainContractId}</span> : null}
        </span>
      ) : (
        <span className="text-[var(--color-text-tertiary)]">Assigned at funding</span>
      ),
    ],
    ['Client wallet', addr(contract.client.walletAddress)],
    ['Freelancer wallet', addr(contract.freelancer.walletAddress)],
    ['Client deposit', <span key="d" className="font-mono tnum">{usdc(amount + clientFee)}</span>],
    ['Freelancer payout', <span key="p" className="font-mono tnum">{usdc(amount - freelancerFee)}</span>],
    ['Fees', `${DEFAULT_CLIENT_FEE_BPS / 100}% client · ${DEFAULT_FREELANCER_FEE_BPS / 100}% freelancer`],
    ['Revisions', contract.onChainMaxRevisions != null ? `${contract.onChainRevisionCount} of ${contract.onChainMaxRevisions} used` : 'Up to 2'],
    ['Work deadline', stamp(contract.workDeadlineAt ?? contract.deliveryDeadline)],
  ];
  if (contract.reviewDeadlineAt) rows.push(['Review ends', stamp(contract.reviewDeadlineAt)]);
  if (contract.disputeDeadlineAt) rows.push(['Arbiter deadline', stamp(contract.disputeDeadlineAt)]);
  if (contract.settledToFreelancer != null) {
    rows.push([
      'Settled',
      <span key="s" className="font-mono text-xs tnum">
        {usdc(BigInt(contract.settledToFreelancer))} freelancer · {usdc(BigInt(contract.settledToClient ?? '0'))} client · {usdc(BigInt(contract.settledToFee ?? '0'))} fee
      </span>,
    ]);
  }

  return (
    <section aria-labelledby="terms-heading">
      <h2 id="terms-heading" className="label-mono border-b border-[var(--color-border-default)] pb-3 text-[var(--color-text-primary)]">
        Terms
      </h2>
      <dl>
        {rows.map(([term, value]) => (
          <div key={term} className={cn('grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 border-b border-[var(--color-border-default)] py-2.5 text-sm')}>
            <dt className="text-[var(--color-text-secondary)]">{term}</dt>
            <dd className="min-w-0 text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">Deposit and payout are in USDC. The escrow contract enforces these terms.</p>
    </section>
  );
}
