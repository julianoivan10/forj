'use client';

/**
 * Generative Bauhaus cover for job cards that don't have an uploaded
 * coverImageUrl. Avoids the "boring grey placeholder" trap that most
 * marketplaces fall into — instead every job card gets a unique,
 * brand-aligned visual derived from its id.
 *
 * Design rules:
 *   - Three primitives only: circle, rectangle, triangle (Bauhaus canon).
 *   - Two-colour fill from the brand triad (vermillion / cobalt / saffron).
 *   - Layout deterministic per `seed` so the same job always renders the
 *     same cover (no flicker between page loads, no SSR mismatch).
 *
 * The colour selection is biased by `category` so cards in the same
 * category share a visual family (development = cobalt-leaning, design =
 * vermillion-leaning, etc.) — gives the listing grid a hum of category
 * colour without being heavy-handed about it.
 */

interface JobCoverFallbackProps {
  seed: string;
  category?: string | null;
}

// Restricted to the product palette: ink, cobalt, ochre, paper. (Key names
// predate the redesign and are kept so the category mapping stays stable.)
const PALETTE = {
  vermillion: '#16150F',
  cobalt: '#1F3FD1',
  saffron: '#9A6A0B',
  cream: '#F3F1EC',
  charcoal: '#16150F',
} as const;

// Categories nudge towards a "lead" colour. Falls back to vermillion.
const CATEGORY_LEAD: Record<string, keyof typeof PALETTE> = {
  development: 'cobalt',
  design: 'vermillion',
  writing: 'saffron',
  marketing: 'vermillion',
  video: 'cobalt',
  audio: 'saffron',
  data: 'cobalt',
  other: 'vermillion',
};

/**
 * Deterministic 32-bit hash from a string. We only need stability + a
 * decent spread for picking layout variants — no cryptographic strength.
 */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LAYOUTS = 6;

export function JobCoverFallback({ seed, category }: JobCoverFallbackProps) {
  const h = hashSeed(seed);
  const layout = h % LAYOUTS;
  const lead = PALETTE[CATEGORY_LEAD[category ?? 'other'] ?? 'vermillion'];
  // Secondary colour: pick the next entry in the triad after the lead so
  // we always end up with a contrasting pair, never lead-on-lead.
  const second =
    lead === PALETTE.vermillion
      ? PALETTE.cobalt
      : lead === PALETTE.cobalt
      ? PALETTE.saffron
      : PALETTE.vermillion;

  return (
    <svg
      viewBox="0 0 320 128"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      className="size-full"
      aria-hidden
    >
      {/* Warm cream base — keeps the geometric shapes feeling like
          ink on paper rather than glow on glass. */}
      <rect width="320" height="128" fill={PALETTE.cream} />

      {/* Subtle dot grid — Bauhaus "machine-made" texture cue. */}
      <defs>
        <pattern id={`dots-${h}`} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill={PALETTE.charcoal} fillOpacity="0.08" />
        </pattern>
      </defs>
      <rect width="320" height="128" fill={`url(#dots-${h})`} />

      {/* Layout variants — six fixed compositions, picked by hash. */}
      {layout === 0 ? (
        <>
          <circle cx="80" cy="64" r="56" fill={lead} />
          <rect x="160" y="32" width="120" height="64" fill={second} />
        </>
      ) : layout === 1 ? (
        <>
          <rect x="20" y="20" width="120" height="88" fill={lead} />
          <circle cx="240" cy="64" r="44" fill={second} />
        </>
      ) : layout === 2 ? (
        <>
          <polygon points="0,128 96,0 192,128" fill={lead} />
          <circle cx="248" cy="76" r="36" fill={second} />
        </>
      ) : layout === 3 ? (
        <>
          <circle cx="160" cy="64" r="64" fill={lead} />
          <rect x="0" y="56" width="320" height="16" fill={second} />
        </>
      ) : layout === 4 ? (
        <>
          <rect x="0" y="0" width="320" height="64" fill={lead} />
          <polygon points="40,128 120,64 200,128" fill={second} />
        </>
      ) : (
        <>
          <rect x="0" y="0" width="160" height="128" fill={lead} />
          <circle cx="220" cy="44" r="28" fill={second} />
          <rect x="200" y="80" width="80" height="32" fill={PALETTE.charcoal} fillOpacity="0.85" />
        </>
      )}
    </svg>
  );
}
