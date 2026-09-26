import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { AppRouter } from '@forj/api';
import type { inferRouterOutputs } from '@trpc/server';
import { StatusTag, statusTone } from '@/components/ui/status';
import { NetworkIndicator } from '@/components/dashboard/network-indicator';
import { isActiveContract, isChainBacked, lifecycleKind } from '@/lib/contract-status';
import { cn } from '@/lib/utils';

type Outputs = inferRouterOutputs<AppRouter>;
export type ConsoleContract = Outputs['contract']['myContracts'][number];
export type ConsoleActivity = Outputs['notification']['list'][number];

export interface ConsoleUser {
  id: string;
  displayName: string | null;
  username: string | null;
  role: 'client' | 'freelancer' | 'both';
  walletAddress: string | null;
  totalEarned: string;
  totalJobsCompleted: number;
  workScore: string;
  badgeTier: string;
}

type Tone = 'active' | 'waiting' | 'negative';

interface QueueItem {
  key: string;
  verb: string;
  subject: string;
  detail: string;
  due: Date | null;
  href: string;
  tone: Tone;
}

const usdc = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function relative(date: Date, now: Date): string {
  const ms = date.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const units: Array<[number, string]> = [
    [86_400_000, 'd'],
    [3_600_000, 'h'],
    [60_000, 'm'],
  ];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size);
      return ms >= 0 ? `in ${n}${unit}` : `${n}${unit} ago`;
    }
  }
  return 'now';
}

function day(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** What the signed-in user has to do next, derived only from contract state. */
export function buildQueue(user: ConsoleUser, contracts: ConsoleContract[], unreadMessages: number, now: Date): QueueItem[] {
  const items: QueueItem[] = [];
  for (const c of contracts) {
    const isClient = c.clientId === user.id;
    const kind = lifecycleKind(c);
    const title = c.job?.title ?? c.title;
    const href = `/dashboard/contracts/${c.id}`;
    const date = (d: Date | string | null | undefined) => (d ? new Date(d) : null);

    if (c.syncIssue) {
      items.push({ key: `${c.id}:sync`, verb: 'Check escrow', subject: title, detail: 'Forj’s record and the blockchain disagree. Re-checking automatically.', due: null, href, tone: 'negative' });
      continue;
    }
    if (kind === 'disputed') {
      items.push({ key: `${c.id}:dispute`, verb: 'Dispute open', subject: title, detail: 'Funds are frozen until the arbiter decides.', due: date(c.disputeDeadlineAt), href, tone: 'negative' });
      continue;
    }
    if (isClient) {
      if (kind === 'unfunded' && c.status === 'created') {
        items.push({ key: `${c.id}:fund`, verb: 'Fund escrow', subject: title, detail: `${usdc(c.totalAmount)} USDC plus the client fee. Work starts after funding.`, due: date(c.deliveryDeadline), href, tone: 'active' });
      } else if (kind === 'submitted') {
        items.push({ key: `${c.id}:review`, verb: 'Review delivery', subject: title, detail: 'Approve, ask for a revision or dispute before the window closes.', due: date(c.reviewDeadlineAt ?? c.autoReleaseAt), href, tone: 'waiting' });
      }
    } else {
      if (kind === 'funded') {
        items.push({ key: `${c.id}:deliver`, verb: 'Deliver work', subject: title, detail: `${usdc(c.totalAmount)} USDC is locked in escrow for you.`, due: date(c.workDeadlineAt ?? c.deliveryDeadline), href, tone: 'active' });
      } else if (kind === 'revision') {
        items.push({ key: `${c.id}:resubmit`, verb: 'Resubmit', subject: title, detail: 'The client asked for changes.', due: date(c.workDeadlineAt), href, tone: 'waiting' });
      } else if (kind === 'submitted') {
        const reviewEnds = date(c.reviewDeadlineAt ?? c.autoReleaseAt);
        if (reviewEnds && reviewEnds < now) {
          items.push({ key: `${c.id}:claim`, verb: 'Claim payment', subject: title, detail: 'The review window ended without a decision.', due: null, href, tone: 'active' });
        }
      }
    }
  }
  if (unreadMessages > 0) {
    items.push({ key: 'messages', verb: 'Reply', subject: `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`, detail: 'From clients and freelancers you work with.', due: null, href: '/dashboard/messages', tone: 'waiting' });
  }
  const rank: Record<Tone, number> = { negative: 0, waiting: 1, active: 2 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone] || (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
}

function nextDate(c: ConsoleContract): Date | null {
  const kind = lifecycleKind(c);
  const d =
    kind === 'submitted' ? c.reviewDeadlineAt ?? c.autoReleaseAt :
    kind === 'disputed' ? c.disputeDeadlineAt :
    kind === 'revision' ? c.workDeadlineAt :
    c.workDeadlineAt ?? c.deliveryDeadline;
  return d ? new Date(d) : null;
}

const TONE_RULE: Record<Tone, string> = {
  active: 'bg-[var(--color-brand-primary)]',
  waiting: 'bg-[var(--color-warning)]',
  negative: 'bg-[var(--color-error)]',
};

export function ConsoleView({
  user,
  contracts,
  activity,
  unreadMessages,
  now,
  escrowAddress,
  explorer,
  loading = false,
  notices,
}: {
  user: ConsoleUser;
  contracts: ConsoleContract[];
  activity: ConsoleActivity[];
  unreadMessages: number;
  now: Date;
  escrowAddress?: string | null;
  explorer: string;
  loading?: boolean;
  notices?: React.ReactNode;
}) {
  const queue = buildQueue(user, contracts, unreadMessages, now);
  const active = contracts.filter(isActiveContract);
  const lockedStates = new Set(['funded', 'submitted', 'revision', 'disputed']);
  const lockedAsClient = active
    .filter((c) => c.clientId === user.id && lockedStates.has(lifecycleKind(c)))
    .reduce((s, c) => s + Number(c.totalAmount), 0);
  const dueToYou = active
    .filter((c) => c.freelancerId === user.id && lockedStates.has(lifecycleKind(c)))
    .reduce((s, c) => s + Number(c.freelancerAmount), 0);
  const isFreelancer = user.role !== 'client';
  const isClient = user.role !== 'freelancer';

  const headline = loading
    ? 'Loading your work…'
    : queue.length === 0
      ? 'Nothing needs you right now.'
      : `${queue.length} ${queue.length === 1 ? 'thing needs' : 'things need'} you.`;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Masthead */}
      <header className="border-b border-[var(--color-rule)] pb-6">
        <p className="label-mono">
          Console · {now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
          {user.displayName ?? user.username ?? 'You'}
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-[var(--color-text-primary)] text-balance">
          {headline}
        </h1>
      </header>

      {notices ? <div className="mt-6 space-y-3">{notices}</div> : null}

      <div className="mt-8 grid gap-x-12 gap-y-12 lg:grid-cols-12">
        {/* 01 — Queue */}
        <section aria-labelledby="queue" className="lg:col-span-7">
          <h2 id="queue" className="label-mono text-[var(--color-text-primary)]">
            <span className="text-[var(--color-brand-primary)]">01</span> — Needs you
          </h2>
          {queue.length === 0 && !loading ? (
            <p className="mt-4 border-t border-[var(--color-border-default)] pt-4 text-[15px] text-[var(--color-text-secondary)]">
              {isClient && isFreelancer
                ? 'No deliveries to review or work to deliver. Post a job or find work to start a contract.'
                : isClient
                  ? 'No deliveries to review. Post a job to start your next contract.'
                  : 'No work due. Find a job or list a service to start your next contract.'}
            </p>
          ) : (
            <ol className="mt-3 border-t border-[var(--color-border-default)]">
              {queue.map((item, i) => (
                <li key={item.key} className="border-b border-[var(--color-border-default)]">
                  <Link
                    href={item.href}
                    className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 py-4 transition-colors hover:bg-[var(--color-text-primary)]/[0.03] sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
                  >
                    <span className="relative pt-0.5 font-mono text-xs text-[var(--color-text-tertiary)] tnum">
                      <span aria-hidden className={cn('absolute -left-3 top-1 h-4 w-[2px] sm:-left-4', TONE_RULE[item.tone])} />
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] text-[var(--color-text-primary)]">
                        <span className="font-semibold">{item.verb}</span>
                        <span className="text-[var(--color-text-tertiary)]"> · </span>
                        <span className="[overflow-wrap:anywhere]">{item.subject}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-[var(--color-text-secondary)]">{item.detail}</span>
                    </span>
                    <span className="flex items-center gap-2 pt-0.5">
                      {item.due ? (
                        <span
                          className={cn(
                            'font-mono text-xs tnum',
                            item.due < now ? 'text-[var(--color-error)]' : 'text-[var(--color-text-secondary)]',
                          )}
                          title={item.due.toLocaleString()}
                        >
                          {relative(item.due, now)}
                        </span>
                      ) : null}
                      <ArrowRight className="size-4 text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text-primary)]" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {isClient ? <QuickLink href="/dashboard/jobs/new">Post a job</QuickLink> : null}
            {isFreelancer ? <QuickLink href="/jobs">Find work</QuickLink> : null}
            {isFreelancer ? <QuickLink href="/dashboard/services/new">List a service</QuickLink> : null}
            {isClient ? <QuickLink href="/services">Browse services</QuickLink> : null}
          </div>
        </section>

        {/* 02 — Ledger */}
        <section aria-labelledby="ledger" className="lg:col-span-5">
          <h2 id="ledger" className="label-mono text-[var(--color-text-primary)]">
            <span className="text-[var(--color-brand-primary)]">02</span> — Ledger
          </h2>
          <dl className="mt-3 border-t border-[var(--color-border-default)]">
            {isClient ? <LedgerRow term="Locked by you in escrow" value={usdc(lockedAsClient)} unit="USDC" /> : null}
            {isFreelancer ? <LedgerRow term="Due to you on delivery" value={usdc(dueToYou)} unit="USDC" /> : null}
            <LedgerRow term="Paid out to you" value={usdc(user.totalEarned)} unit="USDC" emphasis />
            <LedgerRow term="Contracts completed" value={String(user.totalJobsCompleted)} />
            <LedgerRow term="WorkScore" value={Number(user.workScore).toFixed(0)} unit={user.badgeTier === 'none' ? undefined : user.badgeTier} />
          </dl>
          <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
            Escrow amounts are the agreed work amounts. Payouts come from confirmed on-chain releases.
          </p>
        </section>

        {/* 03 — Active contracts */}
        <section aria-labelledby="active" className="lg:col-span-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="active" className="label-mono text-[var(--color-text-primary)]">
              <span className="text-[var(--color-brand-primary)]">03</span> — Active contracts
              <span className="text-[var(--color-text-tertiary)]"> · {active.length}</span>
            </h2>
            <Link href="/dashboard/contracts" className="text-sm text-[var(--color-text-secondary)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text-primary)]">
              All contracts
            </Link>
          </div>
          {active.length === 0 ? (
            <p className="mt-3 border-t border-[var(--color-border-default)] pt-4 text-[15px] text-[var(--color-text-secondary)]">
              No contracts in progress.
            </p>
          ) : (
            <ContractsLedger contracts={active} userId={user.id} now={now} />
          )}
        </section>

        {/* 04 — Activity */}
        <section aria-labelledby="activity" className="lg:col-span-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="activity" className="label-mono text-[var(--color-text-primary)]">
              <span className="text-[var(--color-brand-primary)]">04</span> — Recent activity
            </h2>
            <Link href="/dashboard/notifications" className="text-sm text-[var(--color-text-secondary)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text-primary)]">
              All activity
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="mt-3 border-t border-[var(--color-border-default)] pt-4 text-[15px] text-[var(--color-text-secondary)]">
              Nothing yet. Proposals, funding, deliveries and payouts will be logged here.
            </p>
          ) : (
            <ol className="mt-3 border-t border-[var(--color-border-default)]">
              {activity.slice(0, 8).map((n) => {
                const body = (
                  <>
                    <span className="font-mono text-xs text-[var(--color-text-tertiary)] tnum">{relative(new Date(n.createdAt), now)}</span>
                    <span className="min-w-0">
                      <span className={cn('block text-sm text-[var(--color-text-primary)]', !n.isRead && 'font-semibold')}>
                        {n.title}
                      </span>
                      {n.body ? <span className="block truncate text-sm text-[var(--color-text-secondary)]">{n.body}</span> : null}
                    </span>
                  </>
                );
                return (
                  <li key={n.id} className="border-b border-[var(--color-border-default)]">
                    {n.actionUrl ? (
                      <Link href={n.actionUrl} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-3 hover:bg-[var(--color-text-primary)]/[0.03]">
                        {body}
                      </Link>
                    ) : (
                      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* 05 — Network */}
        <section aria-labelledby="network" className="lg:col-span-5">
          <h2 id="network" className="label-mono text-[var(--color-text-primary)]">
            <span className="text-[var(--color-brand-primary)]">05</span> — Network
          </h2>
          <dl className="mt-3 border-t border-[var(--color-border-default)] text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] py-3">
              <dt className="text-[var(--color-text-secondary)]">Settles on</dt>
              <dd><NetworkIndicator /></dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] py-3">
              <dt className="text-[var(--color-text-secondary)]">Escrow contract</dt>
              <dd>
                {escrowAddress ? (
                  <ExplorerLink href={`${explorer}/address/${escrowAddress}`} text={`${escrowAddress.slice(0, 6)}…${escrowAddress.slice(-4)}`} />
                ) : (
                  <span className="text-[var(--color-text-tertiary)]">—</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] py-3">
              <dt className="text-[var(--color-text-secondary)]">Your payout wallet</dt>
              <dd>
                {user.walletAddress ? (
                  <ExplorerLink href={`${explorer}/address/${user.walletAddress}`} text={`${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}`} />
                ) : (
                  <Link href="/dashboard/settings?tab=wallet" className="text-[var(--color-brand-primary)] underline underline-offset-4">
                    Set up
                  </Link>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

/** Dense contract listing: a real table from `sm`, stacked entries below. */
export function ContractsLedger({ contracts, userId, now }: { contracts: ConsoleContract[]; userId: string; now: Date }) {
  return (
    <div className="mt-3 border-t border-[var(--color-rule)]">
      <table className="hidden w-full border-collapse text-left text-sm md:table">
        <thead>
          <tr className="border-b border-[var(--color-border-default)] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
            <th scope="col" className="py-2.5 pr-4 font-normal">Contract</th>
            <th scope="col" className="py-2.5 pr-4 font-normal">With</th>
            <th scope="col" className="py-2.5 pr-4 font-normal">Status</th>
            <th scope="col" className="py-2.5 pr-4 text-right font-normal">Amount</th>
            <th scope="col" className="py-2.5 text-right font-normal">Next</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => {
            const isClient = c.clientId === userId;
            const other = isClient ? c.freelancer : c.client;
            const next = nextDate(c);
            const kind = lifecycleKind(c);
            return (
              <tr key={c.id} className="border-b border-[var(--color-border-default)] align-top hover:bg-[var(--color-text-primary)]/[0.03]">
                <td className="py-3 pr-4">
                  <Link href={`/dashboard/contracts/${c.id}`} className="font-semibold text-[var(--color-text-primary)] hover:underline hover:underline-offset-4">
                    {c.job?.title ?? c.title}
                  </Link>
                  <span className="mt-0.5 block font-mono text-[11px] text-[var(--color-text-tertiary)]">
                    {c.onChainContractId != null ? `Escrow #${c.onChainContractId}` : `Ref ${c.id.slice(0, 8)}`}
                  </span>
                </td>
                <td className="py-3 pr-4 text-[var(--color-text-secondary)]">
                  {other?.displayName ?? other?.username ?? '—'}
                  <span className="block text-xs text-[var(--color-text-tertiary)]">{isClient ? 'Freelancer' : 'Client'}</span>
                </td>
                <td className="py-3 pr-4">
                  <StatusTag kind={c.syncIssue ? 'mismatch' : kind} />
                  <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                    {isChainBacked(c) ? 'On-chain' : c.escrowVersion === 'v2' && c.onChainContractId != null ? 'Legacy · app record' : 'App record'}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right font-mono tnum text-[var(--color-text-primary)]">{usdc(c.totalAmount)}</td>
                <td className={cn('py-3 text-right font-mono text-xs tnum', next && next < now && statusTone(kind) !== 'positive' ? 'text-[var(--color-error)]' : 'text-[var(--color-text-secondary)]')}>
                  {next ? `${day(next)} · ${relative(next, now)}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="md:hidden">
        {contracts.map((c) => {
          const isClient = c.clientId === userId;
          const other = isClient ? c.freelancer : c.client;
          const next = nextDate(c);
          const kind = lifecycleKind(c);
          return (
            <li key={c.id} className="border-b border-[var(--color-border-default)]">
              <Link href={`/dashboard/contracts/${c.id}`} className="block py-4">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{c.job?.title ?? c.title}</span>
                  <span className="shrink-0 font-mono text-sm tnum text-[var(--color-text-primary)]">{usdc(c.totalAmount)}</span>
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <StatusTag kind={c.syncIssue ? 'mismatch' : kind} />
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {isClient ? 'Freelancer' : 'Client'}: {other?.displayName ?? other?.username ?? '—'}
                  </span>
                  {next ? <span className="font-mono text-xs text-[var(--color-text-tertiary)] tnum">Next {relative(next, now)}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LedgerRow({ term, value, unit, emphasis }: { term: string; value: string; unit?: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border-default)] py-3">
      <dt className="text-sm text-[var(--color-text-secondary)]">{term}</dt>
      <dd className={cn('font-mono tnum text-[var(--color-text-primary)]', emphasis ? 'text-2xl font-semibold tracking-tight' : 'text-lg')}>
        {value}
        {unit ? <span className="ml-1.5 text-xs font-normal uppercase text-[var(--color-text-tertiary)]">{unit}</span> : null}
      </dd>
    </div>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex min-h-11 items-center gap-1.5 font-semibold text-[var(--color-text-primary)] underline decoration-[var(--color-brand-primary)] decoration-2 underline-offset-[6px]">
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function ExplorerLink({ href, text }: { href: string; text: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-[var(--color-text-primary)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-brand-primary)]">
      {text}
      <ArrowUpRight className="size-3" aria-hidden />
      <span className="sr-only">(opens block explorer)</span>
    </a>
  );
}
