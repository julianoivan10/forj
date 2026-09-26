import Link from 'next/link';
import { StatusTag, type StatusKind } from '@/components/ui/status';

interface Party {
  displayName: string | null;
  username: string | null;
}

/**
 * Contract masthead: what the agreement is, between whom, for how much,
 * and where it stands. The status line always says where the status comes
 * from (chain vs Forj's own record).
 */
export function ContractHeader({
  title,
  reference,
  network,
  client,
  freelancer,
  viewerRole,
  amount,
  status,
  statusSource,
}: {
  title: string;
  reference: string;
  network: string;
  client: Party;
  freelancer: Party;
  viewerRole: 'client' | 'freelancer' | 'viewer';
  amount: string;
  status: StatusKind;
  statusSource: 'chain' | 'app' | 'legacy';
}) {
  const name = (p: Party) => p.displayName ?? p.username ?? 'Unknown';
  const partyLink = (p: Party, you: boolean) => (
    <>
      {p.username ? (
        <Link href={`/u/${p.username}`} className="font-semibold text-[var(--color-text-primary)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-text-primary)]">
          {name(p)}
        </Link>
      ) : (
        <span className="font-semibold text-[var(--color-text-primary)]">{name(p)}</span>
      )}
      {you ? <span className="text-[var(--color-text-tertiary)]"> (you)</span> : null}
    </>
  );

  return (
    <header className="border-b border-[var(--color-rule)] pb-6">
      <p className="label-mono">
        Contract · {reference} · {network}
      </p>
      <div className="mt-3 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <h1 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--color-text-primary)] text-balance [overflow-wrap:anywhere]">
            {title}
          </h1>
          <p className="mt-3 text-[15px] text-[var(--color-text-secondary)]">
            Client {partyLink(client, viewerRole === 'client')}
            <span className="mx-2 text-[var(--color-text-tertiary)]" aria-hidden>→</span>
            Freelancer {partyLink(freelancer, viewerRole === 'freelancer')}
          </p>
        </div>
        <div className="lg:col-span-4 lg:text-right">
          <p className="font-mono text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] tnum">
            {Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="ml-2 text-sm font-normal text-[var(--color-text-tertiary)]">USDC</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 lg:justify-end">
            <StatusTag kind={status} />
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
              {statusSource === 'chain' ? `From ${network}` : statusSource === 'legacy' ? 'Legacy escrow · Forj record' : 'Forj record · not on-chain yet'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
