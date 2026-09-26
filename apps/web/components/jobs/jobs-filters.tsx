'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Label, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  DURATION_LABELS,
  EXPERIENCE_LABELS,
  JOB_CATEGORIES,
} from '@/lib/constants';

export type JobCategory = (typeof JOB_CATEGORIES)[number]['value'];
export type JobDuration = keyof typeof DURATION_LABELS;
export type ExperienceLevel = keyof typeof EXPERIENCE_LABELS;

export interface JobsFilterValues {
  categories: JobCategory[];
  durations: JobDuration[];
  experienceLevel: ExperienceLevel | null;
  budgetMin: number | null;
  budgetMax: number | null;
}

interface JobsFiltersProps {
  value: JobsFilterValues;
  onChange: (next: JobsFilterValues) => void;
  onReset: () => void;
}

export function JobsFilters({ value, onChange, onReset }: JobsFiltersProps) {
  // local draft state for budget inputs so typing doesn't immediately re-query
  const [minDraft, setMinDraft] = useState(value.budgetMin?.toString() ?? '');
  const [maxDraft, setMaxDraft] = useState(value.budgetMax?.toString() ?? '');

  useEffect(() => {
    setMinDraft(value.budgetMin?.toString() ?? '');
    setMaxDraft(value.budgetMax?.toString() ?? '');
  }, [value.budgetMin, value.budgetMax]);

  const activeCount =
    value.categories.length +
    value.durations.length +
    (value.experienceLevel ? 1 : 0) +
    (value.budgetMin !== null ? 1 : 0) +
    (value.budgetMax !== null ? 1 : 0);

  const toggleCategory = (cat: JobCategory) => {
    onChange({
      ...value,
      categories: value.categories.includes(cat)
        ? value.categories.filter((c) => c !== cat)
        : [...value.categories, cat],
    });
  };

  const toggleDuration = (d: JobDuration) => {
    onChange({
      ...value,
      durations: value.durations.includes(d)
        ? value.durations.filter((x) => x !== d)
        : [...value.durations, d],
    });
  };

  const setExperience = (level: ExperienceLevel | null) => {
    onChange({ ...value, experienceLevel: level });
  };

  const applyBudget = () => {
    const min = minDraft.trim() === '' ? null : Number(minDraft);
    const max = maxDraft.trim() === '' ? null : Number(maxDraft);
    onChange({
      ...value,
      budgetMin: Number.isFinite(min as number) ? (min as number) : null,
      budgetMax: Number.isFinite(max as number) ? (max as number) : null,
    });
  };

  return (
    <aside className="flex min-w-0 flex-col gap-6 border-t border-[var(--color-rule)] pt-4">
      <div className="flex items-center justify-between">
        <h2 className="label-mono text-[var(--color-text-primary)]">
          Filters {activeCount > 0 ? `· ${activeCount}` : ''}
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-brand-primary)]"
          >
            <X className="size-3" /> Clear all
          </button>
        ) : null}
      </div>

      <FilterSection title="Category">
        <div className="flex flex-col gap-1.5">
          {JOB_CATEGORIES.map((cat) => {
            const active = value.categories.includes(cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => toggleCategory(cat.value)}
                className={cn(
                  'flex items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]',
                )}
              >
                <span>{cat.label}</span>
                <span
                  className={cn(
                    'inline-block size-4 rounded-[4px] border transition-colors',
                    active
                      ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]'
                      : 'border-[var(--color-border-default)]',
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title="Budget (USDC)">
        <div className="flex w-full items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              placeholder="Min"
              inputMode="numeric"
              value={minDraft}
              onChange={(e) => setMinDraft(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={applyBudget}
              onKeyDown={(e) => e.key === 'Enter' && applyBudget()}
            />
          </div>
          <span className="shrink-0 text-sm text-[var(--color-text-tertiary)]">–</span>
          <div className="min-w-0 flex-1">
            <Input
              placeholder="Max"
              inputMode="numeric"
              value={maxDraft}
              onChange={(e) => setMaxDraft(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={applyBudget}
              onKeyDown={(e) => e.key === 'Enter' && applyBudget()}
            />
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Experience">
        <div className="flex flex-col gap-1.5">
          <RadioRow
            label="Any level"
            checked={value.experienceLevel === null}
            onSelect={() => setExperience(null)}
          />
          {(Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]).map((level) => (
            <RadioRow
              key={level}
              label={EXPERIENCE_LABELS[level]}
              checked={value.experienceLevel === level}
              onSelect={() => setExperience(level)}
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Duration">
        <div className="flex flex-col gap-1.5">
          {(Object.keys(DURATION_LABELS) as JobDuration[]).map((d) => {
            const active = value.durations.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDuration(d)}
                className={cn(
                  'flex items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]',
                )}
              >
                <span>{DURATION_LABELS[d]}</span>
                <span
                  className={cn(
                    'inline-block size-4 rounded-[4px] border transition-colors',
                    active
                      ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]'
                      : 'border-[var(--color-border-default)]',
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </FilterSection>
    </aside>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="label-mono">
        {title}
      </Label>
      {children}
    </div>
  );
}

function RadioRow({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm transition-colors',
        checked
          ? 'bg-[var(--color-glow-brand)] text-[var(--color-brand-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-primary)]',
      )}
    >
      <span
        className={cn(
          'inline-block size-3.5 rounded-full border transition-colors',
          checked
            ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]'
            : 'border-[var(--color-border-strong)]',
        )}
        aria-hidden
      />
      {label}
    </button>
  );
}
