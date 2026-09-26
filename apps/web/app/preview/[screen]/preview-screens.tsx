'use client';

import { ConsoleView, ContractsLedger, type ConsoleContract, type ConsoleUser } from '@/components/console/console-view';
import { ContractHeader } from '@/components/contracts/contract-header';
import { EscrowRecord, buildRecordRows } from '@/components/contracts/escrow-record';
import { EscrowTerms, NextStep, availableActions } from '@/components/contracts/escrow-v3-panel';
import { DashboardHeader, MobileTabBar } from '@/components/dashboard/header';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { ProfileView, type ProfileRecord, type ProfileUser } from '@/components/profile/profile-view';
import { NetworkPanel } from '@/components/settings/network-panel';
import { StatusTag, type StatusKind } from '@/components/ui/status';

import type { PreviewScreenName as Screen } from './screens';

const NOW = new Date('2026-09-26T10:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const ESCROW = '0x9813a755cd6daa83a9b32dd7222594208365c43b';
const EXPLORER = 'https://sepolia.basescan.org';
const ME = 'u-me';

const user: ConsoleUser = {
  id: ME,
  displayName: 'Ana Ruiz',
  username: 'anaruiz',
  role: 'both',
  walletAddress: '0x4f2a91c07be3d1a5e9c8f6b21d7e0a93c55b1e20',
  totalEarned: '4380.00',
  totalJobsCompleted: 7,
  workScore: '612',
  badgeTier: 'silver',
};

const party = (id: string, name: string, username: string) => ({ id, displayName: name, username, avatarUrl: null });

function contract(i: number, o: Partial<Record<string, unknown>>): ConsoleContract {
  const base = {
    id: `c0ffee${i}0-0000-4000-8000-00000000000${i}`,
    title: 'Contract',
    clientId: ME,
    freelancerId: 'u-other',
    status: 'in_progress',
    escrowVersion: 'v3',
    onChainStatus: 'funded',
    onChainContractId: 10 + i,
    totalAmount: '1200.00',
    freelancerAmount: '1176.00',
    syncIssue: null,
    deliveryDeadline: days(9),
    workDeadlineAt: days(9),
    reviewDeadlineAt: null,
    disputeDeadlineAt: null,
    autoReleaseAt: null,
    createdAt: days(-12),
    job: { id: `j${i}`, title: 'Contract', slug: `job-${i}` },
    client: party(ME, 'Ana Ruiz', 'anaruiz'),
    freelancer: party('u-other', 'Kofi Mensah', 'kofi'),
  };
  const merged = { ...base, ...o } as Record<string, unknown>;
  (merged.job as { title: string }).title = String(merged.title);
  return merged as unknown as ConsoleContract;
}

const contracts: ConsoleContract[] = [
  contract(1, { title: 'Checkout flow redesign', onChainStatus: 'submitted', status: 'submitted', reviewDeadlineAt: days(4), totalAmount: '2400.00' }),
  contract(2, { title: 'Solidity test suite for vesting contract', clientId: 'u-other', freelancerId: ME, client: party('u-other', 'Lena Park', 'lena'), freelancer: party(ME, 'Ana Ruiz', 'anaruiz'), onChainStatus: 'revision_requested', status: 'revision_requested', workDeadlineAt: days(2), totalAmount: '1000.00', freelancerAmount: '980.00' }),
  contract(3, { title: 'Brand illustration set', onChainStatus: 'disputed', status: 'disputed', disputeDeadlineAt: days(11), totalAmount: '650.00' }),
  contract(4, { title: 'Landing page copy', onChainStatus: 'none', status: 'created', onChainContractId: null, escrowVersion: 'v3', totalAmount: '480.00' }),
  contract(5, { title: 'Data pipeline audit', clientId: 'u-other', freelancerId: ME, client: party('u-other', 'Orbit Labs', 'orbit'), freelancer: party(ME, 'Ana Ruiz', 'anaruiz'), onChainStatus: 'funded', status: 'in_progress', workDeadlineAt: days(6), totalAmount: '3100.00', freelancerAmount: '3038.00' }),
  contract(6, { title: 'Mobile onboarding screens', syncIssue: 'On-chain status is "submitted" but Forj recorded "funded".', onChainStatus: 'funded', totalAmount: '900.00' }),
  contract(7, { title: 'Docs site migration', onChainStatus: 'released', status: 'completed', totalAmount: '1500.00' }),
];

const activity = [
  { id: 'n1', title: 'Work submitted for review', body: 'Kofi Mensah submitted work for “Checkout flow redesign”.', createdAt: new Date(NOW.getTime() - 40 * 60_000), isRead: false, actionUrl: '/dashboard/contracts/1' },
  { id: 'n2', title: 'Revision requested', body: 'Lena Park asked for changes on the vesting test suite.', createdAt: new Date(NOW.getTime() - 5 * 3_600_000), isRead: false, actionUrl: '/dashboard/contracts/2' },
  { id: 'n3', title: 'Escrow funded — start working', body: 'The escrow for “Data pipeline audit” is confirmed on-chain.', createdAt: days(-1), isRead: true, actionUrl: '/dashboard/contracts/5' },
  { id: 'n4', title: 'Contract disputed', body: 'A dispute was opened on “Brand illustration set”.', createdAt: days(-2), isRead: true, actionUrl: null },
  { id: 'n5', title: 'Payment released', body: '“Docs site migration” settled on-chain: 1,470.00 USDC to the freelancer.', createdAt: days(-6), isRead: true, actionUrl: null },
] as unknown as Parameters<typeof ConsoleView>[0]['activity'];

// ── contract detail fixture (V3, revision cycle, one failed attempt, one pending)
const detail = {
  ...contract(1, { title: 'Checkout flow redesign', totalAmount: '2400.00', freelancerAmount: '2352.00' }),
  status: 'submitted',
  chainId: 84532,
  escrowContractAddress: ESCROW,
  onChainStatus: 'submitted',
  onChainRevisionCount: 1,
  onChainMaxRevisions: 2,
  reviewDeadlineAt: days(4),
  workDeadlineAt: days(-1),
  settledToFreelancer: null,
  settledToClient: null,
  settledToFee: null,
  client: { ...party(ME, 'Ana Ruiz', 'anaruiz'), walletAddress: '0x4f2a91c07be3d1a5e9c8f6b21d7e0a93c55b1e20' },
  freelancer: { ...party('u-other', 'Kofi Mensah', 'kofi'), walletAddress: '0x8b19e2c4a0d73f5e61b9c2a4f0e87d3b21c6a9f4' },
} as never;
const tx = (n: string) => `0x${n.repeat(64).slice(0, 64)}`;
const events = [
  { eventName: 'EscrowFunded', txHash: tx('a1'), blockNumber: 47249410n, createdAt: days(-11), args: { amount: '2400000000', clientFee: '120000000', workDeadline: String(Math.floor(days(-4).getTime() / 1000)), maxRevisions: 2 } },
  { eventName: 'WorkSubmitted', txHash: tx('b2'), blockNumber: 47301188n, createdAt: days(-6), args: { submissionNumber: 1, reviewDeadline: String(Math.floor(days(1).getTime() / 1000)) } },
  { eventName: 'RevisionRequested', txHash: tx('c3'), blockNumber: 47322904n, createdAt: days(-4), args: { revisionCount: 1, workDeadline: String(Math.floor(days(3).getTime() / 1000)) } },
  { eventName: 'WorkSubmitted', txHash: tx('d4'), blockNumber: 47389012n, createdAt: days(-3), args: { submissionNumber: 2, reviewDeadline: String(Math.floor(days(4).getTime() / 1000)) } },
];
const failedTx = { id: 't-f', action: 'release', txHash: tx('e5'), status: 'failed' as const, failureReason: 'The transaction reverted on-chain.', createdAt: days(-1) };
const pendingTx = { id: 't-p', action: 'release', txHash: tx('f6'), status: 'pending' as const, failureReason: null, createdAt: new Date(NOW.getTime() - 60_000) };

const profileUser = {
  id: ME,
  username: 'anaruiz',
  displayName: 'Ana Ruiz',
  avatarUrl: null,
  bio: 'Product engineer. I design and build checkout, onboarding and billing flows for small teams, and write the tests that keep them working.',
  role: 'both',
  skills: ['TypeScript', 'React', 'Next.js', 'Solidity', 'Payments', 'Design systems', 'Postgres', 'Testing'],
  hourlyRate: '85.00',
  country: 'Lisbon, Portugal',
  timezone: 'Europe/Lisbon',
  portfolioIpfsHash: null,
  workScore: '612',
  badgeTier: 'silver',
  totalJobsCompleted: 7,
  totalEarned: '4380.00',
  isVerified: true,
  walletAddress: '0x4f2a91c07be3d1a5e9c8f6b21d7e0a93c55b1e20',
  createdAt: new Date('2026-03-02'),
} as unknown as ProfileUser;

const record = [
  { id: 'r1', title: 'Docs site migration', role: 'freelancer', counterparty: { displayName: 'Orbit Labs', username: 'orbit' }, paidToFreelancer: '1470.00', completedAt: days(-6), releaseTxHash: tx('71'), chainId: 84532 },
  { id: 'r2', title: 'Billing settings rebuild', role: 'freelancer', counterparty: { displayName: 'Lena Park', username: 'lena' }, paidToFreelancer: '2156.00', completedAt: days(-40), releaseTxHash: tx('72'), chainId: 84532 },
  { id: 'r3', title: 'Illustration brief', role: 'client', counterparty: { displayName: 'Kofi Mensah', username: 'kofi' }, paidToFreelancer: '735.00', completedAt: days(-75), releaseTxHash: null, chainId: null },
] as unknown as ProfileRecord;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardSidebar />
      <div className="lg:pl-60">
        <DashboardHeader />
        <main className="px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-8">{children}</main>
      </div>
      <MobileTabBar />
    </>
  );
}

export function PreviewScreen({ screen }: { screen: Screen }) {
  if (screen === 'console') {
    return (
      <Shell>
        <ConsoleView user={user} contracts={contracts} activity={activity} unreadMessages={2} now={NOW} escrowAddress={ESCROW} explorer={EXPLORER} />
      </Shell>
    );
  }
  if (screen === 'contracts') {
    return (
      <Shell>
        <div className="mx-auto max-w-6xl">
          <p className="label-mono">Contracts</p>
          <ContractsLedger contracts={contracts} userId={ME} now={NOW} />
        </div>
      </Shell>
    );
  }
  if (screen === 'contract' || screen === 'contract-pending') {
    const txs = screen === 'contract-pending' ? [pendingTx, failedTx] : [failedTx];
    const rows = buildRecordRows(detail, events as never, txs, '0x4f2a91c07be3d1a5e9c8f6b21d7e0a93c55b1e20');
    const actions = availableActions(detail, true, false, screen === 'contract-pending');
    const next = (
      <NextStep
        role="client"
        actions={actions}
        busy={false}
        busyCopy={null}
        pending={screen === 'contract-pending' ? { label: 'Release payment', href: `${EXPLORER}/tx/${pendingTx.txHash}`, network: 'Base Sepolia' } : null}
        waiting="Review the delivery."
        onAction={() => undefined}
      />
    );
    const terms = <EscrowTerms contract={detail} explorer={EXPLORER} network="Base Sepolia" />;
    return (
      <Shell>
        <div className="mx-auto w-full max-w-6xl">
          <ContractHeader
            title="Checkout flow redesign"
            reference="Escrow #11"
            network="Base Sepolia"
            client={{ displayName: 'Ana Ruiz', username: 'anaruiz' }}
            freelancer={{ displayName: 'Kofi Mensah', username: 'kofi' }}
            viewerRole="client"
            amount="2400.00"
            status="submitted"
            statusSource="chain"
          />
          <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-x-12">
            <div className="lg:hidden [&>section]:border-t-0 [&>section]:pt-0">{next}</div>
            <div className="min-w-0 lg:col-span-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border-default)] pb-3">
                <h2 className="label-mono text-[var(--color-text-primary)]">Escrow record</h2>
                <p className="font-mono text-[11px] text-[var(--color-text-tertiary)]">Only confirmed rows come from Base Sepolia</p>
              </div>
              <div className="mt-6">
                <EscrowRecord rows={rows} explorer={EXPLORER} network="Base Sepolia" />
              </div>
              <div className="mt-10 lg:hidden">{terms}</div>
            </div>
            <aside className="hidden lg:col-span-4 lg:block">
              <div className="sticky top-20 space-y-10">
                {next}
                {terms}
              </div>
            </aside>
          </div>
        </div>
      </Shell>
    );
  }
  if (screen === 'profile') {
    return (
      <div className="px-4 pb-20 pt-10 sm:px-6">
        <ProfileView
          user={profileUser}
          record={record}
          reviews={[{ id: 'rv1' }, { id: 'rv2' }] as never}
          rating={{ total: 5, avgRating: 4.8 }}
          jobs={[]}
          explorer={EXPLORER}
          reviewSlot={(r) => (
            <blockquote key={(r as { id: string }).id} className="border-l-2 border-[var(--color-border-strong)] py-1 pl-5">
              <p className="text-[15px] text-[var(--color-text-primary)]">Clear communication, shipped a day early, and the test coverage was better than asked for.</p>
              <footer className="mt-2 text-xs text-[var(--color-text-secondary)]">Lena Park · 5 / 5 · Billing settings rebuild</footer>
            </blockquote>
          )}
        />
      </div>
    );
  }
  if (screen === 'network') {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl">
          <NetworkPanel wallet={user.walletAddress} />
        </div>
      </Shell>
    );
  }
  const kinds: StatusKind[] = ['confirmed', 'pending', 'failed', 'mismatch', 'unfunded', 'funded', 'submitted', 'revision', 'disputed', 'released', 'refunded', 'resolved', 'completed', 'cancelled'];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="label-mono">Status language</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {kinds.map((k) => (
          <StatusTag key={k} kind={k} />
        ))}
      </div>
    </div>
  );
}
