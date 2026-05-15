'use client';

import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * Heart-shaped bookmark button for a single job.
 *
 * Optimistic UX: the heart fills the instant the user taps, then the
 * tRPC mutation resolves in the background. If the server rejects (rate
 * limit, deleted job, etc.) we roll back and show a toast — but in the
 * common case the user sees instant feedback.
 *
 * Two render modes:
 *   - `compact` (default): icon-only 32×32 button, used on JobCard's
 *      top-right corner.
 *   - `withLabel`: icon + "Save" / "Saved" text, used on the full job
 *      detail page where there's room.
 *
 * Anonymous viewers see a disabled button that nudges to sign in — the
 * bookmark is a useful conversion hook ("save this job, sign up to keep
 * track of it"). We don't render any pre-auth state by default though;
 * the parent passes `requireAuth={true}` if it wants the nudge.
 */

interface BookmarkButtonProps {
  jobId: string;
  withLabel?: boolean;
  className?: string;
  /** When true, render even for anonymous users (as a sign-in prompt). */
  showWhenAnonymous?: boolean;
}

export function BookmarkButton({
  jobId,
  withLabel = false,
  className,
  showWhenAnonymous = false,
}: BookmarkButtonProps) {
  const { isAuthenticated, isReady } = useAuth();
  const utils = api.useUtils();
  // Hydrated only when authed — otherwise the query never fires and the
  // button shows the default (unfilled) state.
  const savedQuery = api.savedJob.isSaved.useQuery(
    { jobId },
    { enabled: isReady && isAuthenticated, staleTime: 60_000 },
  );
  const saved = savedQuery.data ?? false;

  const toggle = api.savedJob.toggle.useMutation({
    onMutate: async () => {
      // Optimistic — flip the cache immediately. Cancel any in-flight
      // refetch first so we don't race with it.
      await utils.savedJob.isSaved.cancel({ jobId });
      const prev = utils.savedJob.isSaved.getData({ jobId });
      utils.savedJob.isSaved.setData({ jobId }, !prev);
      return { prev };
    },
    onError: (err, _input, ctx) => {
      // Roll back on failure.
      utils.savedJob.isSaved.setData({ jobId }, ctx?.prev ?? false);
      toast.error(err.message);
    },
    onSettled: () => {
      utils.savedJob.isSaved.invalidate({ jobId });
      // Also invalidate any list view + count that might be showing.
      utils.savedJob.list.invalidate();
      utils.savedJob.count.invalidate();
    },
  });

  if (!isAuthenticated && !showWhenAnonymous) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.info('Sign in to save jobs to your bookmarks.');
      return;
    }
    toggle.mutate({ jobId });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? 'Remove bookmark' : 'Save job'}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-xs font-medium transition-all',
        saved
          ? 'border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-background-elevated)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]',
        className,
      )}
    >
      <Bookmark
        className={cn(
          'size-3.5 transition-all',
          saved ? 'fill-[var(--color-brand-primary)]' : 'group-hover:fill-current',
        )}
      />
      {withLabel ? <span>{saved ? 'Saved' : 'Save'}</span> : null}
    </button>
  );
}
