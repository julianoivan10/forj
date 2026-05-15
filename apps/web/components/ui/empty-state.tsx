import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Universal empty-state surface.
 *
 * Replaces the recurring "Nothing here yet — generic Lucide icon + grey
 * text" pattern that every freelance marketplace defaults to. Here each
 * variant gets its own Bauhaus-style SVG illustration so the empty state
 * carries brand identity instead of feeling like a placeholder.
 *
 * Usage:
 *   <EmptyState
 *     variant="jobs"
 *     title="No jobs posted yet"
 *     description="Post your first job to start receiving proposals."
 *     action={<Button>Post a job</Button>}
 *   />
 *
 * The `compact` prop tunes vertical air for surfaces where the empty
 * state is one of several cards (dashboard overview) instead of the
 * whole route (zero-results page).
 */

export type EmptyVariant =
  | 'jobs'
  | 'proposals'
  | 'contracts'
  | 'services'
  | 'messages'
  | 'notifications'
  | 'reviews'
  | 'search';

interface EmptyStateProps {
  variant: EmptyVariant;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  variant,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-10 px-4' : 'py-16 px-4 sm:py-20',
        className,
      )}
    >
      <EmptyIllustration variant={variant} className={compact ? 'w-32' : 'w-44 sm:w-56'} />
      <h3
        className={cn(
          'mt-6 font-display font-bold tracking-tight text-[var(--color-text-primary)]',
          compact ? 'text-base' : 'text-lg sm:text-xl',
        )}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={cn(
            'mt-2 max-w-md text-[var(--color-text-secondary)]',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/**
 * Bauhaus geometric illustrations for each empty-state variant.
 *
 * Each composition follows the same rules as `JobCoverFallback`:
 *   - three primitives only (circle, rectangle, triangle)
 *   - brand triad (vermillion / cobalt / saffron) + cream paper bg
 *   - the iconic object (paper, contract, bell, etc.) is *implied* by
 *     arrangement rather than literally drawn — keeps the brand
 *     consistent and avoids "Lucide icon enlarged" feel.
 *
 * 160×160 base viewBox so SVG scales cleanly. Background is
 * intentionally `--color-background-tertiary` so the illustration sits
 * on a slightly different surface than the parent card.
 */
function EmptyIllustration({
  variant,
  className,
}: {
  variant: EmptyVariant;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 160"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-auto', className)}
      aria-hidden
    >
      {/* Rounded paper backdrop */}
      <rect
        x="4"
        y="4"
        width="152"
        height="152"
        rx="20"
        fill="var(--color-background-tertiary)"
        stroke="var(--color-border-default)"
        strokeWidth="1"
      />
      {/* Faint dot grid for texture */}
      <defs>
        <pattern id={`empty-dots-${variant}`} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="var(--color-text-primary)" fillOpacity="0.06" />
        </pattern>
      </defs>
      <rect x="4" y="4" width="152" height="152" rx="20" fill={`url(#empty-dots-${variant})`} />

      {variantShapes(variant)}
    </svg>
  );
}

function variantShapes(variant: EmptyVariant): ReactNode {
  switch (variant) {
    case 'jobs':
      // Stacked document silhouettes — paper sheets waiting to be filled.
      return (
        <>
          <rect x="42" y="38" width="62" height="78" rx="4" fill="var(--color-brand-accent)" opacity="0.85" />
          <rect x="52" y="48" width="62" height="78" rx="4" fill="var(--color-brand-primary)" />
          <rect x="62" y="58" width="60" height="6" fill="var(--color-background-secondary)" opacity="0.85" />
          <rect x="62" y="70" width="44" height="4" fill="var(--color-background-secondary)" opacity="0.7" />
          <rect x="62" y="80" width="54" height="4" fill="var(--color-background-secondary)" opacity="0.7" />
          <rect x="62" y="90" width="36" height="4" fill="var(--color-background-secondary)" opacity="0.7" />
          {/* Cobalt slab — the anvil cue */}
          <rect x="34" y="124" width="92" height="4" rx="2" fill="var(--color-brand-secondary)" />
        </>
      );

    case 'proposals':
      // Paper plane — proposals flying out.
      return (
        <>
          <polygon
            points="20,110 140,30 90,140 78,90"
            fill="var(--color-brand-primary)"
          />
          <polygon
            points="20,110 78,90 90,140"
            fill="var(--color-brand-primary)"
            opacity="0.75"
          />
          <circle cx="40" cy="40" r="6" fill="var(--color-brand-accent)" />
          <rect x="124" y="118" width="20" height="3" fill="var(--color-brand-secondary)" />
        </>
      );

    case 'contracts':
      // Two interlocking rectangles — the handshake. Cobalt + vermillion
      // overlap forms an implied chain-link.
      return (
        <>
          <rect x="32" y="48" width="60" height="44" rx="6" fill="var(--color-brand-primary)" />
          <rect x="74" y="68" width="60" height="44" rx="6" fill="var(--color-brand-secondary)" />
          <rect x="74" y="68" width="18" height="24" fill="var(--color-brand-accent)" />
          <rect x="40" y="120" width="80" height="4" rx="2" fill="var(--color-text-primary)" opacity="0.7" />
        </>
      );

    case 'services':
      // Sparkle / spark — a fresh service waiting to be published.
      return (
        <>
          <circle cx="80" cy="80" r="32" fill="var(--color-brand-primary)" />
          <polygon
            points="80,30 86,72 128,80 86,88 80,130 74,88 32,80 74,72"
            fill="var(--color-brand-accent)"
            opacity="0.7"
          />
          <circle cx="80" cy="80" r="10" fill="var(--color-background-secondary)" />
          <rect x="34" y="128" width="92" height="3" rx="1.5" fill="var(--color-brand-secondary)" />
        </>
      );

    case 'messages':
      // Two speech bubbles — implied conversation.
      return (
        <>
          <rect x="28" y="42" width="76" height="46" rx="10" fill="var(--color-brand-secondary)" />
          <polygon points="40,84 52,84 44,98" fill="var(--color-brand-secondary)" />
          <rect x="60" y="80" width="76" height="46" rx="10" fill="var(--color-brand-primary)" />
          <polygon points="118,124 124,108 130,124" fill="var(--color-brand-primary)" />
          {/* Implied text lines */}
          <rect x="40" y="58" width="44" height="3" rx="1.5" fill="var(--color-background-secondary)" opacity="0.8" />
          <rect x="40" y="68" width="32" height="3" rx="1.5" fill="var(--color-background-secondary)" opacity="0.6" />
          <rect x="72" y="96" width="44" height="3" rx="1.5" fill="var(--color-background-secondary)" opacity="0.8" />
          <rect x="72" y="106" width="36" height="3" rx="1.5" fill="var(--color-background-secondary)" opacity="0.6" />
        </>
      );

    case 'notifications':
      // Bell silhouette as a bauhaus arch + dot.
      return (
        <>
          <path
            d="M 50 100 A 30 30 0 0 1 110 100 L 110 110 L 50 110 Z"
            fill="var(--color-brand-primary)"
          />
          <circle cx="80" cy="60" r="6" fill="var(--color-brand-accent)" />
          <rect x="76" y="60" width="8" height="40" fill="var(--color-brand-primary)" />
          <circle cx="80" cy="124" r="6" fill="var(--color-brand-secondary)" />
          <rect x="34" y="138" width="92" height="3" rx="1.5" fill="var(--color-text-primary)" opacity="0.5" />
        </>
      );

    case 'reviews':
      // Pentagonal star + horizontal lines (review breakdown bars).
      return (
        <>
          <polygon
            points="80,30 90,62 124,62 96,82 106,116 80,96 54,116 64,82 36,62 70,62"
            fill="var(--color-brand-accent)"
          />
          <rect x="32" y="124" width="40" height="4" rx="2" fill="var(--color-brand-primary)" />
          <rect x="76" y="124" width="28" height="4" rx="2" fill="var(--color-brand-secondary)" />
          <rect x="108" y="124" width="20" height="4" rx="2" fill="var(--color-text-primary)" opacity="0.3" />
        </>
      );

    case 'search':
      // Magnifying glass — circle + handle as triangle.
      return (
        <>
          <circle
            cx="70"
            cy="70"
            r="34"
            fill="none"
            stroke="var(--color-brand-primary)"
            strokeWidth="8"
          />
          <rect
            x="92"
            y="92"
            width="36"
            height="8"
            rx="4"
            transform="rotate(45 92 92)"
            fill="var(--color-brand-secondary)"
          />
          <circle cx="70" cy="70" r="14" fill="var(--color-brand-accent)" opacity="0.5" />
        </>
      );

    default:
      return null;
  }
}
