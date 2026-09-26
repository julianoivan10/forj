import {
  ArrowDownLeft,
  Check,
  CircleDashed,
  Flag,
  Hourglass,
  RotateCcw,
  Scale,
  Square,
  SquareDot,
  TriangleAlert,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Forj status language.
 *
 * Two vocabularies, never mixed:
 *   - sync      — where a blockchain action stands: CONFIRMED · PENDING · FAILED · MISMATCH
 *   - lifecycle — where the escrow stands: FUNDED · SUBMITTED · REVISION · DISPUTED ·
 *                 RELEASED · REFUNDED · RESOLVED (+ app-only states before funding)
 *
 * Every status carries text + an icon shape + a semantic colour, so meaning
 * never depends on colour alone. Tones:
 *   positive (green)  confirmed on-chain, paid out
 *   waiting  (ochre)  pending transaction, revision, awaiting someone
 *   negative (red)    failed, disputed, mismatch
 *   active   (cobalt) escrow live, work in motion
 *   neutral  (ink)    refunded, cancelled, not started
 */
export type StatusKind =
  | 'confirmed'
  | 'pending'
  | 'failed'
  | 'mismatch'
  | 'draft'
  | 'unfunded'
  | 'funded'
  | 'submitted'
  | 'revision'
  | 'disputed'
  | 'released'
  | 'refunded'
  | 'resolved'
  | 'completed'
  | 'cancelled';

type Tone = 'positive' | 'waiting' | 'negative' | 'active' | 'neutral';

const STATUS: Record<StatusKind, { label: string; tone: Tone; Icon: typeof Check }> = {
  confirmed: { label: 'Confirmed', tone: 'positive', Icon: Check },
  pending: { label: 'Pending', tone: 'waiting', Icon: CircleDashed },
  failed: { label: 'Failed', tone: 'negative', Icon: X },
  mismatch: { label: 'Mismatch', tone: 'negative', Icon: TriangleAlert },
  draft: { label: 'Draft', tone: 'neutral', Icon: Square },
  unfunded: { label: 'Not funded', tone: 'neutral', Icon: Square },
  funded: { label: 'Funded', tone: 'active', Icon: SquareDot },
  submitted: { label: 'In review', tone: 'active', Icon: Hourglass },
  revision: { label: 'Revision', tone: 'waiting', Icon: RotateCcw },
  disputed: { label: 'Disputed', tone: 'negative', Icon: Flag },
  released: { label: 'Released', tone: 'positive', Icon: Check },
  refunded: { label: 'Refunded', tone: 'neutral', Icon: ArrowDownLeft },
  resolved: { label: 'Resolved', tone: 'active', Icon: Scale },
  completed: { label: 'Completed', tone: 'positive', Icon: Check },
  cancelled: { label: 'Cancelled', tone: 'neutral', Icon: X },
};

const TONE_TEXT: Record<Tone, string> = {
  positive: 'text-[var(--color-success)]',
  waiting: 'text-[var(--color-warning)]',
  negative: 'text-[var(--color-error)]',
  active: 'text-[var(--color-brand-primary)]',
  neutral: 'text-[var(--color-text-secondary)]',
};

const TONE_BOX: Record<Tone, string> = {
  positive: 'border-[var(--color-success)]/45 bg-[var(--color-success)]/[0.07]',
  waiting: 'border-[var(--color-warning)]/50 bg-[var(--color-warning)]/[0.08]',
  negative: 'border-[var(--color-error)]/45 bg-[var(--color-error)]/[0.07]',
  active: 'border-[var(--color-brand-primary)]/40 bg-[var(--color-brand-primary)]/[0.06]',
  neutral: 'border-[var(--color-border-strong)] bg-transparent',
};

export function statusTone(kind: StatusKind): Tone {
  return STATUS[kind].tone;
}

export function statusLabel(kind: StatusKind): string {
  return STATUS[kind].label;
}

/** Compact tag: icon + mono uppercase text inside a thin tone-coloured frame. */
export function StatusTag({
  kind,
  label,
  className,
  title,
}: {
  kind: StatusKind;
  label?: string;
  className?: string;
  title?: string;
}) {
  const { tone, Icon, label: fallback } = STATUS[kind];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border px-2',
        'font-mono text-[11px] font-medium uppercase tracking-[0.06em]',
        TONE_BOX[tone],
        TONE_TEXT[tone],
        kind === 'mismatch' && 'border-dashed',
        className,
      )}
    >
      <Icon className={cn('size-3 shrink-0', kind === 'pending' && 'pending-pulse')} aria-hidden strokeWidth={2.5} />
      {label ?? fallback}
    </span>
  );
}

/** Bare glyph for timelines and dense tables (always pair with visible text nearby). */
export function StatusGlyph({ kind, className }: { kind: StatusKind; className?: string }) {
  const { tone, Icon } = STATUS[kind];
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] border bg-[var(--color-background)]',
        TONE_BOX[tone],
        TONE_TEXT[tone],
        kind === 'mismatch' && 'border-dashed',
        kind === 'pending' && 'border-dashed',
        className,
      )}
    >
      <Icon className={cn('size-3.5', kind === 'pending' && 'pending-pulse')} strokeWidth={2.5} />
    </span>
  );
}
