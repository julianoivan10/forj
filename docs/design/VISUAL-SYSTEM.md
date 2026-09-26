# Forj visual system

Professional work infrastructure with an on-chain contract layer. Paper and ink, hairline rules,
one accent. Colour means something or it isn't used.

Tokens: `packages/config/tailwind/theme.css`. Status language: `apps/web/components/ui/status.tsx`.

## Colour

| Role | Paper (default) | Carbon (dark) | Use for |
|---|---|---|---|
| Page | `#F3F1EC` | `#121211` | background |
| Sheet | `#FAF9F6` | `#1A1A18` | surfaces that sit on the page (inputs, panels) |
| Sunken | `#E9E6DF` | `#232320` | skeletons, table heads, code |
| Ink | `#16150F` | `#EDEBE4` | text; editorial rules (`--color-rule`) |
| Secondary / tertiary ink | `#4A4841` / `#6B685F` | `#B8B5AC` / `#8F8C83` | supporting text, mono labels |
| **Cobalt** (`--color-brand-primary`) | `#1F3FD1` | `#7F96FF` | the one accent: primary action, links, focus, active nav |
| Green (`--color-success`) | `#3B6E1F` | `#93C463` | confirmed on-chain, paid out |
| Ochre (`--color-warning`) | `#9A6A0B` | `#D9A441` | waiting: pending tx, revision, testnet |
| Red (`--color-error`) | `#B42318` | `#F07360` | failed, disputed, mismatch, destructive |

Text on cobalt fills uses `--color-on-brand` (white on paper, ink on carbon). All text pairs meet
WCAG AA at their sizes.

## Type

- **Instrument Sans**: display and UI. Oversized, tight-tracked headlines (`clamp()`), calm body at 15px.
- **IBM Plex Mono**: technical metadata only: addresses, hashes, block numbers, amounts in tables,
  and the `.label-mono` section voice (11px, uppercase, tracked).
- Amounts use tabular figures (`.tnum`).

## Form

- Radii 2–4px. Containers are **ruled, not boxed**: sections open with a mono label over a hairline
  (or an ink rule for primary sections). Use a bordered box only when grouping needs it (pending
  notice, tags, inputs).
- No gradients, glows, glass, blur, drop shadows or decorative illustration.
- Numbered sections (`01 — Needs you`) give long screens an editorial rhythm.

## Status language

Two vocabularies, never mixed. Each state has text + an icon shape + a colour.

| Sync (where a chain action stands) | Lifecycle (where the escrow stands) |
|---|---|
| CONFIRMED (green ✓) · PENDING (ochre, dashed, pulsing) · FAILED (red ✕) · MISMATCH (red, dashed ⚠) | NOT FUNDED · FUNDED · IN REVIEW · REVISION · DISPUTED · RELEASED · REFUNDED · RESOLVED |

Rules:
- A V3 contract's lifecycle status comes from the on-chain mirror only (`lib/contract-status.ts`).
  Anything from Forj's own records is labelled "App record" or "Forj record".
- Never show CONFIRMED for something only the database says happened.

## Motion

State only: page enter (180ms), escrow record reveal, pending pulse. Everything is clamped to ~0ms
under `prefers-reduced-motion` (CSS) and `MotionConfig reducedMotion="user"` (Framer Motion).

## Layout patterns

- **Console / tables**: dense tables from `md`, stacked entries below (not shrunken cards).
- **Contract page**: record (vertical ledger) left, sticky next-step and terms right; on mobile the
  next step comes first.
- **Navigation**: text rail on desktop; bottom tab bar (4 destinations + More sheet) on mobile.

## Previews

`/preview/{console|contracts|contract|contract-pending|profile|network|status}` renders the real views
from fixtures for visual and responsive checks. The routes exist in `next dev`, or in a production
build made with `FORJ_UI_PREVIEW=1`; any other build returns a hard 404.
