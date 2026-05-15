import { Skeleton } from '@/components/ui';

/**
 * Dashboard loading shell. Renders while a server component is streaming
 * inside the dashboard layout. Matches the visual rhythm of the dashboard
 * pages (header → cards) so the user doesn't see a hard layout shift when
 * content lands.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <Skeleton className="h-8 w-48 rounded" />
      <Skeleton className="mt-2 h-4 w-72 rounded" />
      <div className="mt-8 flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-xl)]" />
        ))}
      </div>
    </div>
  );
}
