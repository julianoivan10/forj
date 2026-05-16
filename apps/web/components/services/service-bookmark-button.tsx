'use client';

import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * Bookmark a service. Direct sibling of `BookmarkButton` for jobs —
 * same optimistic-update pattern, same anti-anonymous nudge.
 *
 * Kept in a separate component so feature surfaces import what they
 * actually use (services/jobs are unrelated UI domains).
 */
export function ServiceBookmarkButton({
  serviceId,
  withLabel = false,
  className,
  showWhenAnonymous = false,
}: {
  serviceId: string;
  withLabel?: boolean;
  className?: string;
  showWhenAnonymous?: boolean;
}) {
  const { isAuthenticated, isReady } = useAuth();
  const utils = api.useUtils();
  const savedQuery = api.savedService.isSaved.useQuery(
    { serviceId },
    { enabled: isReady && isAuthenticated, staleTime: 60_000 },
  );
  const saved = savedQuery.data ?? false;

  const toggle = api.savedService.toggle.useMutation({
    onMutate: async () => {
      await utils.savedService.isSaved.cancel({ serviceId });
      const prev = utils.savedService.isSaved.getData({ serviceId });
      utils.savedService.isSaved.setData({ serviceId }, !prev);
      return { prev };
    },
    onError: (err, _input, ctx) => {
      utils.savedService.isSaved.setData({ serviceId }, ctx?.prev ?? false);
      toast.error(err.message);
    },
    onSettled: () => {
      utils.savedService.isSaved.invalidate({ serviceId });
      utils.savedService.list.invalidate();
      utils.savedService.count.invalidate();
    },
  });

  if (!isAuthenticated && !showWhenAnonymous) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.info('Sign in to save services to your bookmarks.');
      return;
    }
    toggle.mutate({ serviceId });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? 'Remove bookmark' : 'Save service'}
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
