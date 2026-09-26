import { cn } from '@/lib/utils';

/**
 * Editorial section opener: a numbered mono label over a display headline.
 * Numbers make the page read as one continuous document, not a stack of
 * unrelated blocks.
 */
export function SectionHeading({
  index,
  label,
  title,
  className,
  id,
}: {
  index: string;
  label: string;
  title: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn('max-w-3xl', className)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
        <span className="text-[var(--color-brand-primary)]">{index}</span>
        <span aria-hidden> — </span>
        {label}
      </p>
      <h2
        id={id}
        className="mt-4 font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] text-balance"
      >
        {title}
      </h2>
    </div>
  );
}

export const landingLinkPrimary =
  'inline-flex min-h-12 items-center justify-center gap-2 bg-[var(--color-brand-primary)] px-6 text-sm font-semibold text-[var(--color-on-brand)] transition-[background-color,transform] duration-150 hover:bg-[var(--color-brand-secondary)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-primary)]';

export const landingLinkSecondary =
  'inline-flex min-h-12 items-center justify-center gap-2 border border-[var(--color-border-strong)] px-6 text-sm font-semibold text-[var(--color-text-primary)] transition-[border-color,background-color] duration-150 hover:border-[var(--color-text-primary)] hover:bg-[var(--color-text-primary)]/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-primary)]';
