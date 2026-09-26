'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { ConsoleView, type ConsoleUser } from '@/components/console/console-view';
import { ProfileCompleteness } from '@/components/dashboard/profile-completeness';
import { RecoveryNudge } from '@/components/dashboard/recovery-nudge';
import { useInboxCounts } from '@/components/dashboard/sidebar';

/**
 * Console: the signed-in home. Data wiring only; the layout lives in
 * <ConsoleView> so it can be rendered from fixtures too.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const contracts = api.contract.myContracts.useQuery(undefined, { enabled: Boolean(user) });
  const activity = api.notification.list.useQuery({ limit: 8 }, { enabled: Boolean(user) });
  const escrow = api.escrow.config.useQuery(undefined, { staleTime: 5 * 60_000 });
  const counts = useInboxCounts();
  const now = useMemo(() => new Date(), []);

  if (!user) return null;

  const consoleUser: ConsoleUser = {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    role: (user.role ?? 'client') as ConsoleUser['role'],
    walletAddress: user.walletAddress,
    totalEarned: String(user.totalEarned ?? '0'),
    totalJobsCompleted: user.totalJobsCompleted ?? 0,
    workScore: String(user.workScore ?? '0'),
    badgeTier: user.badgeTier ?? 'none',
  };

  return (
    <ConsoleView
      user={consoleUser}
      contracts={contracts.data ?? []}
      activity={activity.data ?? []}
      unreadMessages={counts.messages}
      now={now}
      loading={contracts.isPending}
      escrowAddress={escrow.data?.enabled ? escrow.data.escrowAddress : null}
      explorer={escrow.data?.enabled ? escrow.data.explorer : 'https://sepolia.basescan.org'}
      notices={
        <>
          <ProfileCompleteness />
          <RecoveryNudge />
        </>
      }
    />
  );
}
