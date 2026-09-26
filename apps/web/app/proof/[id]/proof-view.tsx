'use client';

import { IS_MAINNET } from '@/lib/chain';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  HandCoins,
  Link as LinkIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@forj/api';
import { Badge, Button, Skeleton, UserAvatar } from '@/components/ui';
import { ReviewCard } from '@/components/reviews';
import { api } from '@/lib/trpc/client';
import { BADGE_TIER_META } from '@/lib/constants';
import { cn, formatUSD } from '@/lib/utils';

type PublicProof = inferRouterOutputs<AppRouter>['contract']['publicProof'];

/**
 * Public proof view — the page anyone can land on without signing in.
 *
 * Layout intent:
 *   1. Hero strip with the brand "Verified on Forj" badge — establishes
 *      cryptographic credibility before any prose.
 *   2. Big freelancer + client cards with avatars + WorkScore tier (so the
 *      visitor can see "real people did real work for real money").
 *   3. Money panel (total, freelancer payout, fee).
 *   4. Timeline rail of dated milestones (created → funded → submitted →
 *      completed) with on-chain tx links.
 *   5. Reviews carousel.
 *   6. CTA: "Hire {freelancer}" — the conversion moment.
 *
 * Performance: queried once via tRPC, no streaming or skeleton loops needed.
 */
export function ProofView({ contractId }: { contractId: string }) {
  const proof = api.contract.publicProof.useQuery({ id: contractId }, { retry: false });

  if (proof.isPending) {
    return <ProofSkeleton />;
  }

  if (proof.isError || !proof.data) {
    return (
      <ProofError
        message={
          proof.error?.message ??
          "We couldn't load this proof — the contract may not be completed yet."
        }
      />
    );
  }

  const { contract, reviews } = proof.data;
  return <ProofContent contract={contract} reviews={reviews} />;
}

function ProofContent({
  contract,
  reviews,
}: {
  contract: PublicProof['contract'];
  reviews: PublicProof['reviews'];
}) {
  // The freelancer is the protagonist of the proof — a client viewing this
  // wants to know "who did this work, and would they do it for me?".
  const freelancer = contract.freelancer;
  const client = contract.client;

  const explorerBase = useExplorerBase();
  const tier =
    BADGE_TIER_META[freelancer.badgeTier as keyof typeof BADGE_TIER_META] ??
    BADGE_TIER_META.none;

  // The freelancer→client review (if any) is what shows the client's voice.
  const clientReview = reviews.find((r) => r.reviewerId === client.id) ?? null;
  const freelancerReview = reviews.find((r) => r.reviewerId === freelancer.id) ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-16">
      {/* ── Hero ── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-6 sm:p-8"
      >
        <div className="flex items-center gap-2 text-[var(--color-brand-primary)]">
          <ShieldCheck className="size-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Verified on Forj
          </span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          {contract.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-secondary)] sm:text-base">
          A real client paid a real freelancer for completed work. Settled in USDC on Base
          — every figure on this page is independently verifiable on-chain.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge variant="success" className="gap-1.5">
            <CheckCircle2 className="size-3" /> Completed
          </Badge>
          <Badge variant="brand" className="gap-1.5">
            <Coins className="size-3" />
            {formatUSD(contract.totalAmount)} {contract.currency}
          </Badge>
          {contract.escrowTxHash ? (
            <Badge variant="default" className="gap-1.5">
              <Sparkles className="size-3" />
              On-chain settlement
            </Badge>
          ) : null}
        </div>
      </motion.header>

      {/* ── Parties ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mt-6 grid gap-4 sm:grid-cols-2"
      >
        <PartyCard
          label="Freelancer"
          username={freelancer.username}
          displayName={freelancer.displayName}
          avatarUrl={freelancer.avatarUrl}
          workScore={Number(freelancer.workScore ?? 0)}
          tierLabel={tier.label}
          tierColor={tier.color}
          isProtagonist
        />
        <PartyCard
          label="Client"
          username={client.username}
          displayName={client.displayName}
          avatarUrl={client.avatarUrl}
        />
      </motion.section>

      {/* ── Money panel ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-6 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
      >
        <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
          Settlement breakdown
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Stat label="Total" value={formatUSD(contract.totalAmount)} icon={<Coins />} />
          <Stat
            label="Paid to freelancer"
            value={formatUSD(contract.freelancerAmount)}
            icon={<HandCoins />}
            highlight
          />
          <Stat
            label="Platform fee"
            value={formatUSD(contract.platformFee)}
            icon={<BadgeCheck />}
          />
        </div>
      </motion.section>

      {/* ── On-chain timeline ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-6 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6"
      >
        <h2 className="font-display text-base font-semibold text-[var(--color-text-primary)]">
          On-chain timeline
        </h2>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Click any tx hash to inspect the original transaction on Basescan.
        </p>
        <ol className="mt-5 space-y-4">
          <TimelineRow
            icon={<Briefcase className="size-3.5" />}
            label="Contract created"
            timestamp={contract.createdAt}
          />
          {contract.fundedAt ? (
            <TimelineRow
              icon={<Coins className="size-3.5" />}
              label="Escrow funded"
              timestamp={contract.fundedAt}
              tx={
                contract.escrowTxHash
                  ? { hash: contract.escrowTxHash, explorer: explorerBase }
                  : undefined
              }
            />
          ) : null}
          {contract.submittedAt ? (
            <TimelineRow
              icon={<Sparkles className="size-3.5" />}
              label="Work submitted"
              timestamp={contract.submittedAt}
            />
          ) : null}
          {contract.completedAt ? (
            <TimelineRow
              icon={<CheckCircle2 className="size-3.5" />}
              label="Funds released"
              timestamp={contract.completedAt}
              tx={
                contract.releaseTxHash
                  ? { hash: contract.releaseTxHash, explorer: explorerBase }
                  : undefined
              }
              terminal
            />
          ) : null}
        </ol>
        {contract.escrowContractAddress ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-tertiary)]/40 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            <ShieldCheck className="size-3.5 text-[var(--color-brand-primary)]" />
            <span>Escrow contract:</span>
            <a
              href={`${explorerBase}/address/${contract.escrowContractAddress}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[var(--color-brand-primary)] hover:underline"
            >
              {contract.escrowContractAddress.slice(0, 6)}…
              {contract.escrowContractAddress.slice(-4)}
              <ExternalLink className="size-3" />
            </a>
            {contract.onChainContractId != null ? (
              <span className="ml-auto font-mono text-[var(--color-text-tertiary)]">
                Escrow #{contract.onChainContractId}
              </span>
            ) : null}
          </div>
        ) : null}
      </motion.section>

      {/* ── Reviews ── */}
      {reviews.length > 0 ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6"
        >
          <h2 className="mb-4 font-display text-base font-semibold text-[var(--color-text-primary)]">
            What they said
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {clientReview ? (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  From the client
                </p>
                <ReviewCard review={clientReview} />
              </div>
            ) : null}
            {freelancerReview ? (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  From the freelancer
                </p>
                <ReviewCard review={freelancerReview} />
              </div>
            ) : null}
          </div>
        </motion.section>
      ) : null}

      {/* ── CTA ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-8"
      >
        <ShareBar contractId={contract.id} />
        {freelancer.username ? (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] p-6 text-center">
            <p className="font-display text-lg font-bold text-[var(--color-text-primary)]">
              Looking for someone like {freelancer.displayName ?? freelancer.username}?
            </p>
            <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
              View their full profile on Forj — every contract, every review,
              every payment is on-chain.
            </p>
            <Link href={`/u/${freelancer.username}`}>
              <Button>
                See profile
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        ) : null}

        <p className="mt-6 text-center text-xs text-[var(--color-text-tertiary)]">
          Powered by{' '}
          <Link href="/" className="text-[var(--color-brand-primary)] hover:underline">
            Forj
          </Link>
          {' '}— the freelance platform where reputation is yours, not the platform's.
        </p>
      </motion.section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────

function PartyCard({
  label,
  username,
  displayName,
  avatarUrl,
  workScore,
  tierLabel,
  tierColor,
  isProtagonist,
}: {
  label: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  workScore?: number;
  tierLabel?: string;
  tierColor?: string;
  isProtagonist?: boolean;
}) {
  const name = displayName ?? username ?? 'User';
  const profileHref = username ? `/u/${username}` : null;
  const inner = (
    <div
      className={cn(
        'flex h-full items-center gap-4 rounded-[var(--radius-xl)] border bg-[var(--color-background-secondary)] p-5 transition-colors',
        isProtagonist
          ? 'border-[var(--color-border-brand)]'
          : 'border-[var(--color-border-default)]',
        profileHref && 'hover:border-[var(--color-border-strong)]',
      )}
    >
      <UserAvatar name={name} imageUrl={avatarUrl} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
          {label}
        </p>
        <p className="truncate font-display text-base font-semibold text-[var(--color-text-primary)]">
          {name}
        </p>
        {username ? (
          <p className="truncate text-xs text-[var(--color-text-tertiary)]">
            @{username}
          </p>
        ) : null}
        {workScore != null && tierLabel ? (
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: tierColor }}
            />
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              WorkScore {workScore.toFixed(0)} · {tierLabel}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
  return profileHref ? <Link href={profileHref}>{inner}</Link> : inner;
}

function Stat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3',
        highlight
          ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)]'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-background-tertiary)]/40',
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] [&_svg]:size-4',
          highlight
            ? 'bg-[var(--color-brand-primary)]/20 text-[var(--color-brand-primary)]'
            : 'bg-[var(--color-background-elevated)] text-[var(--color-text-secondary)]',
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {label}
        </p>
        <p className="truncate font-display text-base font-bold text-[var(--color-text-primary)]">
          {value}
        </p>
      </div>
    </div>
  );
}

function TimelineRow({
  icon,
  label,
  timestamp,
  tx,
  terminal,
}: {
  icon: React.ReactNode;
  label: string;
  timestamp: string | Date;
  tx?: { hash: string; explorer: string };
  terminal?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border',
          terminal
            ? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]'
            : 'border-[var(--color-border-default)] bg-[var(--color-background-tertiary)] text-[var(--color-brand-primary)]',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {new Date(timestamp).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        {tx ? (
          <a
            href={`${tx.explorer}/tx/${tx.hash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-[var(--color-brand-primary)] hover:underline"
          >
            {tx.hash.slice(0, 8)}…{tx.hash.slice(-6)}
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function ShareBar({ contractId }: { contractId: string }) {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/proof/${contractId}`;
  }, [contractId]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied — share anywhere');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between sm:gap-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Drop this link in a portfolio, a tweet, or a cold pitch.
      </p>
      <Button variant="secondary" onClick={copy} leftIcon={copied ? <Check /> : <LinkIcon />}>
        {copied ? 'Copied' : 'Copy share link'}
        {!copied ? <Copy className="size-3.5" /> : null}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// State variants
// ─────────────────────────────────────────────────────────────────

function ProofSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-16">
      <Skeleton className="h-44 w-full rounded-[var(--radius-xl)]" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-[var(--radius-xl)]" />
        <Skeleton className="h-28 rounded-[var(--radius-xl)]" />
      </div>
      <Skeleton className="mt-6 h-40 rounded-[var(--radius-xl)]" />
      <Skeleton className="mt-6 h-72 rounded-[var(--radius-xl)]" />
    </div>
  );
}

function ProofError({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
        <ShieldCheck className="size-7 text-[var(--color-text-tertiary)]" />
      </div>
      <h1 className="font-display text-2xl font-bold text-[var(--color-text-primary)]">
        Proof not available
      </h1>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">{message}</p>
      <Link href="/" className="mt-2 text-sm text-[var(--color-brand-primary)] hover:underline">
        Back to Forj →
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Pick the right Basescan flavor based on the deployed registry's chain.
 * For an unconfigured environment we fall back to Sepolia — proofs from a
 * test-net deploy still land on a working explorer.
 */
function useExplorerBase(): string {
  // Decoupled from the wallet hook chain — this page can render without a
  // wallet at all (anonymous visitor). We read the env var the deployment
  // script wrote to decide which network's explorer to link.
  if (IS_MAINNET) {
    return 'https://basescan.org';
  }
  return 'https://sepolia.basescan.org';
}
