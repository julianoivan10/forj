'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Link2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Skeleton } from '@/components/ui';
import { ReviewCard } from '@/components/reviews';
import { ProfileView } from '@/components/profile/profile-view';
import { useAuth } from '@/hooks/use-auth';
import { IS_MAINNET } from '@/lib/chain';
import { logger } from '@/lib/logger';
import { api } from '@/lib/trpc/client';

interface UserProfileProps {
  username: string;
}

/** Data wiring for the public profile; layout lives in <ProfileView>. */
export function UserProfile({ username }: UserProfileProps) {
  const { user: me } = useAuth();
  const userQuery = api.user.getByUsername.useQuery({ username }, { retry: false });
  const userId = userQuery.data?.id;
  const record = api.user.workRecord.useQuery({ username }, { enabled: Boolean(userId), retry: false });
  const stats = api.review.statsByUser.useQuery({ userId: userId ?? '' }, { enabled: Boolean(userId) });
  const reviews = api.review.listByUser.useQuery({ userId: userId ?? '' }, { enabled: Boolean(userId) });
  const isClient = userQuery.data ? userQuery.data.role !== 'freelancer' : false;
  const jobs = api.job.publicByClient.useQuery({ clientId: userId ?? '', limit: 6 }, { enabled: Boolean(userId) && isClient });

  if (userQuery.isLoading) return <ProfileSkeleton />;

  if (userQuery.error || !userQuery.data) {
    return (
      <div className="mx-auto max-w-2xl border-y border-dashed border-[var(--color-border-strong)] py-12">
        <p className="label-mono">Not found</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          No one on Forj uses the name <span className="font-mono">@{username}</span>.
        </h1>
        <Link href="/jobs" className="mt-6 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
          Browse open jobs
        </Link>
      </div>
    );
  }

  const user = userQuery.data;
  const isSelf = me?.id === user.id;

  return (
    <ProfileView
      user={user}
      record={record.data ?? []}
      reviews={reviews.data ?? []}
      rating={stats.data ?? null}
      jobs={jobs.data ?? []}
      explorer={IS_MAINNET ? 'https://basescan.org' : 'https://sepolia.basescan.org'}
      reviewSlot={(r) => <ReviewCard key={r.id} review={r} />}
      actions={
        <>
          {isSelf ? (
            <Button variant="secondary" asChild>
              <Link href="/dashboard/settings">Edit profile</Link>
            </Button>
          ) : (
            <MessageButton userId={user.id} />
          )}
          <ShareProfileButton username={user.username} />
        </>
      }
    />
  );
}

function ShareProfileButton({ username }: { username: string | null }) {
  if (!username) return null;
  const handleClick = async () => {
    const url = `${window.location.origin}/u/${username}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Profile link copied');
    } catch {
      toast.error("Couldn't copy — clipboard access blocked");
    }
  };
  return (
    <Button variant="ghost" onClick={handleClick} leftIcon={<Link2 />} aria-label="Copy profile link">
      Copy link
    </Button>
  );
}

function MessageButton({ userId }: { userId: string }) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const utils = api.useUtils();
  const handleClick = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    try {
      const result = await utils.message.getOrStart.fetch({ userId });
      router.push(`/dashboard/messages/${encodeURIComponent(result.conversationId)}`);
    } catch (err) {
      logger.error('profile/message-start', 'Failed to start conversation', err);
      router.push('/dashboard/messages');
    }
  };
  return (
    <Button leftIcon={<MessageSquare />} onClick={handleClick}>
      Message
    </Button>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-14 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-10 h-48 w-full" />
    </div>
  );
}
