import { Skeleton } from '@/components/ui';

/**
 * Loading shell for the services marketplace. Renders a card grid that
 * matches the real page layout so there's no jump when content arrives.
 */
export default function ServicesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="space-y-2 pb-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-[var(--radius-xl)]" />
        ))}
      </div>
    </div>
  );
}
