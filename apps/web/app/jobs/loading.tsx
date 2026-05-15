import { Skeleton } from '@/components/ui';

/**
 * Loading shell for `/jobs/*`. Mirrors the real list layout (header strip,
 * sidebar of filters, 4 card skeletons) so there's no visible jump when
 * the data lands.
 */
export default function JobsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-32 rounded-[var(--radius-md)]" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Skeleton className="h-[420px] rounded-[var(--radius-xl)]" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-[var(--radius-xl)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
