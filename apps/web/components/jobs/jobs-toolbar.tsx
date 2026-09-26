'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

export type JobsSort = 'latest' | 'budget_high' | 'budget_low' | 'most_proposals';

const SORT_OPTIONS: Array<{ value: JobsSort; label: string }> = [
  { value: 'latest', label: 'Latest' },
  { value: 'budget_high', label: 'Highest budget' },
  { value: 'budget_low', label: 'Lowest budget' },
  { value: 'most_proposals', label: 'Most proposals' },
];

interface JobsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: JobsSort;
  onSortChange: (sort: JobsSort) => void;
  totalLabel?: string;
}

export function JobsToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  totalLabel,
}: JobsToolbarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 sm:max-w-md">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search jobs by title or description…"
          leftIcon={<Search />}
        />
      </div>

      <div className="flex items-center gap-3">
        {totalLabel ? (
          <span className="hidden text-sm text-[var(--color-text-tertiary)] sm:inline">
            {totalLabel}
          </span>
        ) : null}

        <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <span className="sr-only sm:not-sr-only">Sort by</span>
          <div
            className={cn(
              'relative flex h-11 items-center rounded-[var(--radius-md)]',
              'border border-[var(--color-border-default)] bg-[var(--color-background-elevated)]',
              'focus-within:border-[var(--color-brand-primary)]',
            )}
          >
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as JobsSort)}
              className="appearance-none bg-transparent px-3 pr-8 text-sm text-[var(--color-text-primary)] focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 text-[var(--color-text-tertiary)]">▾</span>
          </div>
        </label>
      </div>
    </div>
  );
}
