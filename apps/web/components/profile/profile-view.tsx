import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';
import type { AppRouter } from '@forj/api';
import type { inferRouterOutputs } from '@trpc/server';
import { UserAvatar } from '@/components/ui';
import { StatusTag } from '@/components/ui/status';

type Outputs = inferRouterOutputs<AppRouter>;
export type ProfileUser = Outputs['user']['getByUsername'];
export type ProfileRecord = Outputs['user']['workRecord'];
export type ProfileReview = Outputs['review']['listByUser'][number];
export type ProfileJob = Outputs['job']['publicByClient'][number];

const usdc = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const month = (d: Date | string) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const dayOf = (d: Date | string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function SectionTitle({ index, children, aside }: { index: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-rule)] pb-3">
      <h2 className="label-mono text-[var(--color-text-primary)]">
        <span className="text-[var(--color-brand-primary)]">{index}</span> — {children}
      </h2>
      {aside}
    </div>
  );
}

/**
 * Public work identity. Reads like a professional record: who, what they
 * do, the contracts they completed (with on-chain receipts), what the
 * people they worked with said. No follower counts, no social chrome.
 */
export function ProfileView({
  user,
  record,
  reviews,
  rating,
  jobs,
  explorer,
  actions,
  reviewSlot,
}: {
  user: ProfileUser;
  record: ProfileRecord;
  reviews: ProfileReview[];
  rating: { total: number; avgRating: number } | null;
  jobs: ProfileJob[];
  explorer: string;
  actions?: React.ReactNode;
  /** Renders one review (ReviewCard) — injected so this view stays presentational. */
  reviewSlot: (review: ProfileReview) => React.ReactNode;
}) {
  const asFreelancer = record.filter((r) => r.role === 'freelancer');
  const asClient = record.filter((r) => r.role === 'client');
  const paidOut = asFreelancer.reduce((s, r) => s + Number(r.paidToFreelancer), 0);
  const roleLabel =
    user.role === 'both' || (asFreelancer.length > 0 && asClient.length > 0)
      ? 'Freelancer and client'
      : user.role === 'client'
        ? 'Client'
        : 'Freelancer';
  const facts = [
    roleLabel,
    user.country ?? null,
    user.timezone ?? null,
    user.hourlyRate ? `${usdc(user.hourlyRate)} USDC / hour` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-6xl">
      {/* Masthead */}
      <header className="grid gap-10 border-b border-[var(--color-rule)] pb-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="label-mono">
            Work identity · @{user.username} · on Forj since {month(user.createdAt)}
          </p>
          <div className="mt-5 flex items-start gap-5">
            <UserAvatar name={user.displayName} imageUrl={user.avatarUrl} size="xl" className="shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                {user.displayName}
              </h1>
              {user.isVerified ? (
                <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-success)]">
                  <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> Identity verified
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-5 text-[15px] text-[var(--color-text-secondary)]">{facts.join('  ·  ')}</p>
          {user.bio ? (
            <p className="mt-5 max-w-2xl whitespace-pre-wrap text-[17px] leading-relaxed text-[var(--color-text-primary)]">{user.bio}</p>
          ) : null}
          {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </div>

        <dl className="self-end border-t border-[var(--color-border-default)] lg:col-span-5 lg:col-start-8">
          <Fact term="Contracts completed" value={String(record.length)} detail={asFreelancer.length && asClient.length ? `${asFreelancer.length} delivered · ${asClient.length} hired` : undefined} />
          <Fact term="Paid through Forj" value={usdc(paidOut)} unit="USDC" />
          <Fact term="WorkScore" value={Number(user.workScore).toFixed(0)} unit={user.badgeTier !== 'none' ? user.badgeTier : undefined} />
          <Fact
            term="Rating"
            value={rating && rating.total > 0 ? rating.avgRating.toFixed(1) : '—'}
            unit={rating && rating.total > 0 ? `/ 5 · ${rating.total} review${rating.total === 1 ? '' : 's'}` : 'no reviews yet'}
          />
          <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border-default)] py-3">
            <dt className="text-sm text-[var(--color-text-secondary)]">Payout wallet</dt>
            <dd>
              {user.walletAddress ? (
                <a
                  href={`${explorer}/address/${user.walletAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-mono text-xs text-[var(--color-text-primary)] underline decoration-[var(--color-border-strong)] underline-offset-2 hover:decoration-[var(--color-brand-primary)]"
                >
                  {user.walletAddress.slice(0, 6)}…{user.walletAddress.slice(-4)}
                  <ArrowUpRight className="size-3" aria-hidden />
                  <span className="sr-only">(opens block explorer)</span>
                </a>
              ) : (
                <span className="text-sm text-[var(--color-text-tertiary)]">Not set</span>
              )}
            </dd>
          </div>
        </dl>
      </header>

      <div className="mt-12 space-y-14">
        {/* 01 — Work record */}
        <section aria-label="Work record">
          <SectionTitle
            index="01"
            aside={<span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">Completed contracts, newest first</span>}
          >
            Work record
          </SectionTitle>
          {record.length === 0 ? (
            <p className="mt-4 text-[15px] text-[var(--color-text-secondary)]">No completed contracts yet.</p>
          ) : (
            <>
              <table className="mt-1 hidden w-full border-collapse text-left text-sm md:table">
                <thead>
                  <tr className="border-b border-[var(--color-border-default)] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                    <th scope="col" className="py-2.5 pr-4 font-normal">Contract</th>
                    <th scope="col" className="py-2.5 pr-4 font-normal">Role</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-normal">Paid out</th>
                    <th scope="col" className="py-2.5 pr-4 font-normal">Completed</th>
                    <th scope="col" className="py-2.5 text-right font-normal">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {record.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--color-border-default)] align-top">
                      <td className="py-3 pr-4">
                        <span className="font-semibold text-[var(--color-text-primary)]">{r.title}</span>
                        <span className="block text-xs text-[var(--color-text-tertiary)]">
                          with {r.counterparty?.displayName ?? r.counterparty?.username ?? 'a Forj member'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-[var(--color-text-secondary)]">{r.role === 'freelancer' ? 'Delivered' : 'Hired'}</td>
                      <td className="py-3 pr-4 text-right font-mono tnum text-[var(--color-text-primary)]">{usdc(r.paidToFreelancer)}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-[var(--color-text-secondary)]">{r.completedAt ? dayOf(r.completedAt) : '—'}</td>
                      <td className="py-3 text-right">
                        <Evidence record={r} explorer={explorer} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="md:hidden">
                {record.map((r) => (
                  <li key={r.id} className="border-b border-[var(--color-border-default)] py-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-semibold text-[var(--color-text-primary)] [overflow-wrap:anywhere]">{r.title}</span>
                      <span className="shrink-0 font-mono text-sm tnum">{usdc(r.paidToFreelancer)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {r.role === 'freelancer' ? 'Delivered' : 'Hired'} · with {r.counterparty?.displayName ?? r.counterparty?.username ?? 'a Forj member'}
                      {r.completedAt ? ` · ${dayOf(r.completedAt)}` : ''}
                    </p>
                    <div className="mt-2">
                      <Evidence record={r} explorer={explorer} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="grid gap-14 lg:grid-cols-12">
          {/* 02 — Skills */}
          <section aria-label="Skills" className="lg:col-span-4">
            <SectionTitle index="02">Skills</SectionTitle>
            {user.skills.length ? (
              <ul className="mt-3 columns-2 gap-6 text-[15px] text-[var(--color-text-primary)]">
                {user.skills.map((s) => (
                  <li key={s} className="break-inside-avoid border-b border-[var(--color-border-subtle)] py-1.5">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[var(--color-text-secondary)]">No skills listed.</p>
            )}
          </section>

          {/* 03 — Reviews */}
          <section aria-label="Reviews" className="lg:col-span-8">
            <SectionTitle
              index="03"
              aside={
                rating && rating.total > 0 ? (
                  <span className="font-mono text-xs text-[var(--color-text-secondary)] tnum">
                    {rating.avgRating.toFixed(1)} / 5 · {rating.total}
                  </span>
                ) : undefined
              }
            >
              What clients and freelancers said
            </SectionTitle>
            {reviews.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                No reviews yet. Reviews can only be left by the other party of a completed contract.
              </p>
            ) : (
              <div className="mt-4 space-y-4">{reviews.slice(0, 6).map((r) => reviewSlot(r))}</div>
            )}
          </section>
        </div>

        {jobs.length > 0 ? (
          <section aria-label="Jobs posted">
            <SectionTitle index="04">Jobs posted</SectionTitle>
            <ul className="mt-1">
              {jobs.map((j) => (
                <li key={j.id} className="border-b border-[var(--color-border-default)]">
                  <Link href={`/jobs/${j.slug}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-3 hover:bg-[var(--color-text-primary)]/[0.03]">
                    <span className="min-w-0 truncate font-semibold text-[var(--color-text-primary)]">{j.title}</span>
                    <span className="font-mono text-xs text-[var(--color-text-secondary)] tnum">
                      {usdc(j.budgetMin)}–{usdc(j.budgetMax)} · {j.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ term, value, unit, detail }: { term: string; value: string; unit?: string; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border-default)] py-3">
      <dt className="text-sm text-[var(--color-text-secondary)]">
        {term}
        {detail ? <span className="block text-xs text-[var(--color-text-tertiary)]">{detail}</span> : null}
      </dt>
      <dd className="text-right font-mono text-lg tnum text-[var(--color-text-primary)]">
        {value}
        {unit ? <span className="ml-1.5 text-xs uppercase text-[var(--color-text-tertiary)]">{unit}</span> : null}
      </dd>
    </div>
  );
}

function Evidence({ record, explorer }: { record: ProfileRecord[number]; explorer: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 md:justify-end">
      <Link href={`/proof/${record.id}`} className="text-xs underline decoration-[var(--color-border-strong)] underline-offset-2 hover:decoration-[var(--color-text-primary)]">
        Proof
      </Link>
      {record.releaseTxHash ? (
        <a
          href={`${explorer}/tx/${record.releaseTxHash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-xs underline decoration-[var(--color-border-strong)] underline-offset-2 hover:decoration-[var(--color-brand-primary)]"
        >
          Release tx <ArrowUpRight className="size-3" aria-hidden />
        </a>
      ) : null}
      <StatusTag kind={record.releaseTxHash ? 'confirmed' : 'draft'} label={record.releaseTxHash ? 'On-chain' : 'Forj record'} />
    </span>
  );
}
