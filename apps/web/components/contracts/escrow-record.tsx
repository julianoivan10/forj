import { ArrowUpRight } from 'lucide-react';
import { StatusGlyph, StatusTag, type StatusKind } from '@/components/ui/status';
import { cn } from '@/lib/utils';

/** Confirmed on-chain event as returned by `escrow.activity`. */
export interface RecordEvent {
  eventName: string;
  txHash: string;
  blockNumber: bigint | number | string;
  args: Record<string, string | number | boolean>;
  createdAt: Date | string;
}

/** A transaction Forj knows about (pending / confirmed / failed). */
export interface RecordTx {
  id: string;
  action: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  failureReason: string | null;
  createdAt: Date | string;
}

export interface RecordContract {
  status: string;
  createdAt: Date | string;
  onChainStatus: string;
  syncIssue: string | null;
  workDeadlineAt: Date | string | null;
  reviewDeadlineAt: Date | string | null;
  disputeDeadlineAt: Date | string | null;
  deliveryDeadline: Date | string;
  onChainRevisionCount: number;
  onChainMaxRevisions: number | null;
}

type Source = 'chain' | 'app' | 'expected';

export interface RecordRow {
  key: string;
  kind: StatusKind;
  tag: StatusKind;
  tagLabel?: string;
  source: Source;
  title: string;
  detail?: string;
  at?: Date;
  block?: string;
  txHash?: string;
}

export const ACTION_LABEL: Record<string, string> = {
  fund: 'Fund escrow',
  submit_work: 'Submit work',
  request_revision: 'Request revision',
  release: 'Release payment',
  release_after_review: 'Claim after review window',
  cancel_by_freelancer: 'Cancel and refund client',
  refund_after_deadline: 'Refund after missed deadline',
  raise_dispute: 'Open dispute',
  resolve_dispute: 'Arbiter resolution',
  resolve_expired_dispute: 'Apply default dispute split',
};

const units = (v: unknown) =>
  (Number(v ?? 0) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const secs = (v: unknown) => (v ? new Date(Number(v) * 1000) : null);
export const stamp = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function describe(ev: RecordEvent, clientWallet: string | null): Omit<RecordRow, 'key' | 'source' | 'at' | 'block' | 'txHash' | 'tag'> {
  const a = ev.args;
  switch (ev.eventName) {
    case 'EscrowFunded':
      return {
        kind: 'funded',
        title: 'Escrow funded',
        detail: `${units(Number(a.amount) + Number(a.clientFee))} USDC locked · work due ${stamp(secs(a.workDeadline))} · up to ${a.maxRevisions} revisions`,
      };
    case 'WorkSubmitted':
      return {
        kind: 'submitted',
        title: Number(a.submissionNumber) > 1 ? `Work resubmitted (#${a.submissionNumber})` : 'Work submitted',
        detail: `Client review open until ${stamp(secs(a.reviewDeadline))}`,
      };
    case 'RevisionRequested':
      return { kind: 'revision', title: `Revision ${a.revisionCount} requested`, detail: `Resubmit by ${stamp(secs(a.workDeadline))}` };
    case 'DisputeRaised':
      return {
        kind: 'disputed',
        title: 'Dispute opened',
        detail: `By the ${clientWallet && String(a.by) === clientWallet.toLowerCase() ? 'client' : 'freelancer'} · arbiter decides by ${stamp(secs(a.disputeDeadline))}`,
      };
    case 'Released':
      return {
        kind: 'released',
        title: a.byTimeout ? 'Released after the review window' : 'Payment released',
        detail: `${units(a.toFreelancer)} USDC to the freelancer · ${units(a.toFee)} USDC fee`,
      };
    case 'Refunded':
      return {
        kind: 'refunded',
        title: Number(a.reason) === 1 ? 'Refunded: deadline missed' : 'Refunded: freelancer cancelled',
        detail: `${units(a.toClient)} USDC returned to the client · no fee`,
      };
    case 'DisputeResolved':
      return {
        kind: 'resolved',
        title: a.byTimeout ? 'Dispute settled by default (50/50)' : `Dispute resolved · ${Number(a.freelancerShareBps) / 100}% to freelancer`,
        detail: `${units(a.toFreelancer)} to freelancer · ${units(a.toClient)} to client · ${units(a.toFee)} fee`,
      };
    default:
      return { kind: 'confirmed', title: ev.eventName };
  }
}

/**
 * The record, oldest first:
 *   app record (agreement)  → confirmed chain events and failed attempts, in time order
 *   → a pending transaction, if any → what is expected next (not yet happened).
 * A drift warning, when present, leads.
 */
export function buildRecordRows(
  c: RecordContract,
  events: RecordEvent[],
  txs: RecordTx[],
  clientWallet: string | null,
): RecordRow[] {
  const past: RecordRow[] = [
    {
      key: 'agreement',
      kind: 'draft',
      tag: 'draft',
      tagLabel: 'App record',
      source: 'app',
      title: 'Agreement created',
      detail: 'Terms agreed on Forj. Nothing is on-chain until the client funds the escrow.',
      at: new Date(c.createdAt),
    },
  ];
  for (const ev of events) {
    past.push({
      key: `${ev.txHash}:${ev.eventName}`,
      ...describe(ev, clientWallet),
      tag: 'confirmed',
      source: 'chain',
      at: new Date(ev.createdAt),
      block: String(ev.blockNumber),
      txHash: ev.txHash,
    });
  }
  for (const t of txs.filter((x) => x.status === 'failed')) {
    past.push({
      key: t.id,
      kind: 'failed',
      tag: 'failed',
      source: 'chain',
      title: `${ACTION_LABEL[t.action] ?? t.action} did not go through`,
      detail: `${t.failureReason ?? 'The transaction failed.'} No funds moved.`,
      at: new Date(t.createdAt),
      txHash: t.txHash,
    });
  }
  past.sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));

  const rows: RecordRow[] = [];
  if (c.syncIssue) {
    rows.push({
      key: 'mismatch',
      kind: 'mismatch',
      tag: 'mismatch',
      source: 'app',
      title: 'Forj’s record doesn’t match the blockchain',
      detail: `${c.syncIssue} The blockchain is authoritative; Forj re-checks automatically.`,
    });
  }
  rows.push(...past);

  const pending = txs.find((t) => t.status === 'pending');
  if (pending) {
    rows.push({
      key: pending.id,
      kind: 'pending',
      tag: 'pending',
      source: 'chain',
      title: `${ACTION_LABEL[pending.action] ?? pending.action}: waiting for confirmation`,
      detail: 'Sent to the network. Nothing is final until it is confirmed.',
      at: new Date(pending.createdAt),
      txHash: pending.txHash,
    });
  }

  const s = c.onChainStatus;
  const expected = (title: string, detail?: string): RecordRow => ({
    key: `next:${title}`,
    kind: 'draft',
    tag: 'draft',
    tagLabel: 'Next',
    source: 'expected',
    title,
    detail,
  });
  if (s === 'none' && c.status === 'created') {
    rows.push(expected('Client funds the escrow', 'Amount plus the client fee moves into ForjEscrowV3.'));
  } else if (s === 'funded') {
    rows.push(expected('Freelancer delivers', `Due ${stamp(c.workDeadlineAt ?? c.deliveryDeadline)}. After that the client may take a refund.`));
  } else if (s === 'revision_requested') {
    rows.push(expected('Freelancer resubmits', `Due ${stamp(c.workDeadlineAt)}.`));
  } else if (s === 'submitted') {
    rows.push(
      expected(
        'Client decides',
        `Approve, request a revision (${Math.max(0, (c.onChainMaxRevisions ?? 0) - c.onChainRevisionCount)} left) or dispute by ${stamp(c.reviewDeadlineAt)}. Otherwise anyone can release payment to the freelancer.`,
      ),
    );
  } else if (s === 'disputed') {
    rows.push(expected('Arbiter decides', `By ${stamp(c.disputeDeadlineAt)}. If not, anyone can apply a 50/50 split with no fee.`));
  }
  if (!['released', 'refunded', 'resolved'].includes(s) && !(s === 'none' && c.status !== 'created')) {
    rows.push(expected('Settlement', 'Funds leave the escrow exactly once: released, refunded or split.'));
  }
  return rows;
}

export function EscrowRecord({
  rows,
  explorer,
  network,
}: {
  rows: RecordRow[];
  explorer: string;
  network: string;
}) {
  return (
    <ol className="relative" aria-label="Escrow record">
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        return (
          <li
            key={r.key}
            className={cn(
              'ledger-row relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4 pb-7 last:pb-0 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto]',
              r.source === 'expected' && 'opacity-70',
            )}
            style={{ '--i': Math.min(i, 8) } as React.CSSProperties}
          >
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[0.8125rem] top-8 bottom-0 w-px',
                  r.source === 'expected' || rows[i + 1]?.source === 'expected'
                    ? 'border-l border-dashed border-[var(--color-border-strong)]'
                    : 'bg-[var(--color-rule)]',
                )}
              />
            ) : null}
            {/* Glyph = what happened (lifecycle); tag = whether the chain confirmed it. */}
            <StatusGlyph kind={r.source === 'expected' ? 'draft' : r.kind} />
            <div className="min-w-0">
              <p
                className={cn(
                  'font-display text-[16px] font-semibold leading-snug',
                  r.source === 'expected' ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]',
                )}
              >
                {r.title}
              </p>
              {r.detail ? <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{r.detail}</p> : null}
              {(r.at || r.block || r.txHash) && r.source !== 'expected' ? (
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--color-text-tertiary)]">
                  {r.at ? <span>{stamp(r.at)}</span> : null}
                  {r.block ? <span className="tnum">Block {r.block}</span> : null}
                  {r.txHash ? (
                    <a
                      href={`${explorer}/tx/${r.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-[var(--color-text-secondary)] underline decoration-[var(--color-border-strong)] underline-offset-2 hover:text-[var(--color-brand-primary)]"
                    >
                      {r.txHash.slice(0, 10)}…{r.txHash.slice(-6)}
                      <ArrowUpRight className="size-3" aria-hidden />
                      <span className="sr-only">View on {network} explorer</span>
                    </a>
                  ) : null}
                </p>
              ) : null}
              <span className="mt-2 inline-block sm:hidden">
                <StatusTag kind={r.tag} label={r.tag === 'confirmed' ? `Confirmed · ${network}` : r.tagLabel} />
              </span>
            </div>
            <span className="hidden pt-0.5 sm:block">
              <StatusTag kind={r.tag} label={r.tag === 'confirmed' ? 'Confirmed' : r.tagLabel} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
