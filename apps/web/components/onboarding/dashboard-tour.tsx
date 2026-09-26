'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui';

/**
 * Lightweight in-app product tour for first-time users.
 *
 * Why a custom implementation instead of driver.js / shepherd / intro.js:
 *   - Those libs are 30–80 KB, far more than we need for 5 steps.
 *   - We have full Bauhaus styling control + spring physics that match
 *     our motion language.
 *   - One less third-party dep at runtime is one fewer thing to audit.
 *
 * Mechanics:
 *   - Each step has a `target` CSS selector. We resolve the element on
 *     entry, compute its bounding rect, and position the popover near
 *     it (with viewport-edge clamping). If the target can't be found
 *     (e.g. the user is mid-route-change) we centre the popover and
 *     drop the spotlight.
 *   - A semi-opaque overlay with a CSS `mask` cuts a hole around the
 *     target so the rest of the page dims while the highlight remains
 *     fully lit. The mask is applied as a radial-gradient — cheaper
 *     than rendering an SVG occluder.
 *   - Completion is persisted under a userId-scoped localStorage key
 *     so logging out + logging in as a different account replays the
 *     tour for them.
 *
 * The tour fires once per (browser × userId) after onboarding completes.
 * Users can dismiss with "Skip tour" at any time; the dismissed flag is
 * the same as "completed" so they don't get nagged again.
 */

interface Step {
  title: string;
  body: string;
  /** CSS selector for the element to spotlight. Empty = centred popover. */
  target?: string;
  /** Where to place the popover relative to the target. */
  placement?: 'bottom' | 'top' | 'left' | 'right';
}

/**
 * Tour steps. Each `target` is a CSS selector — prefer `data-tour="…"`
 * attributes (added explicitly on the target element) over `aria-label`
 * or `href` matches, because:
 *   - `aria-label` is often shared between a mobile (hidden) and a
 *     desktop variant of the same button. `querySelector` then picks
 *     the first match (mobile), which has `rect = 0×0` on desktop and
 *     lands the popover in the top-left corner.
 *   - `href` selectors are brittle if a route gets renamed.
 *
 * Placement is "where the popover sits relative to the target" — we
 * default to `bottom` but use `right` for sidebar items so the popover
 * doesn't cover the rest of the nav column.
 */
const STEPS: Step[] = [
  {
    title: 'Welcome to Forj.',
    body: "Quick tour — 30 seconds. We'll show you the four moves that get you from sign-up to your first paid contract.",
  },
  {
    title: 'Your wallet lives here',
    body: 'Settings is where you check your USDC balance, copy your deposit address, and (later) cash out.',
    target: '[data-tour="sidebar-settings"]',
    placement: 'right',
  },
  {
    title: 'Find work or hire talent',
    body: "Use the search bar — Cmd+K from anywhere — to jump to a job, a service, or a freelancer. It's the fastest way around.",
    target: '[data-tour="search-trigger"]',
    placement: 'bottom',
  },
  {
    title: 'Save jobs you like',
    body: 'Tap the bookmark icon on any job card. They land here so you can come back without searching again.',
    target: '[data-tour="sidebar-saved"]',
    placement: 'right',
  },
  {
    title: "You're ready.",
    body: "Post a job, browse the catalog, or apply to one. Funds settle on-chain — no chargebacks, no platform-controlled holds. Reach out if anything's confusing.",
  },
];

const KEY_PREFIX = 'forj:onboarding-tour:done:';

export function DashboardTour() {
  const { user, isReady } = useAuth();
  const [index, setIndex] = useState(0);
  const [show, setShow] = useState(false);

  // Decide whether to run on first sight of an authenticated user. The
  // `onboardingCompleted` flag is set by the multi-step signup form;
  // we only fire after that to avoid layering this tour on top of the
  // username/role picker.
  useEffect(() => {
    if (!isReady || !user || !user.isOnboarded) return;
    const done = window.localStorage.getItem(`${KEY_PREFIX}${user.id}`);
    if (done === '1') return;
    setShow(true);
  }, [isReady, user]);

  if (!show || !user) return null;

  const finish = () => {
    window.localStorage.setItem(`${KEY_PREFIX}${user.id}`, '1');
    setShow(false);
  };
  const next = () => {
    if (index >= STEPS.length - 1) finish();
    else setIndex((i) => i + 1);
  };
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <AnimatePresence>
      <TourOverlay key={index} step={STEPS[index]!} index={index} total={STEPS.length} onNext={next} onPrev={prev} onSkip={finish} />
    </AnimatePresence>
  );
}

interface OverlayProps {
  step: Step;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

function TourOverlay({ step, index, total, onNext, onPrev, onSkip }: OverlayProps) {
  // Resolve the highlighted element + its viewport rect on each step.
  // Using useLayoutEffect so the popover lands before the user sees a
  // paint with the old position when navigating forwards/backwards.
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const recompute = () => {
      const el = document.querySelector(step.target!);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [step.target]);

  // Position the popover. If we have a target rect, place it adjacent;
  // otherwise centre it. Includes a 12px gap so the popover never
  // touches the highlighted element.
  const popoverStyle = computePopoverPosition(rect, step.placement);
  // CSS mask cutout — circular hole around the target. Falls back to
  // a flat dim layer when there's no target.
  const overlayStyle: React.CSSProperties = rect
    ? {
        // The mask uses a radial gradient: transparent inside the hole,
        // opaque outside. We pad the hole by 8px so the highlight has
        // a soft halo.
        WebkitMaskImage: `radial-gradient(circle at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent ${Math.max(rect.width, rect.height) / 2 + 12}px, black ${Math.max(rect.width, rect.height) / 2 + 24}px)`,
        maskImage: `radial-gradient(circle at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent ${Math.max(rect.width, rect.height) / 2 + 12}px, black ${Math.max(rect.width, rect.height) / 2 + 24}px)`,
      }
    : {};

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[80] bg-black/55"
        style={overlayStyle}
        onClick={onSkip}
      />

      {/* Glowing ring around the highlight — makes the target obvious
          even when the mask hole doesn't fully isolate it. */}
      {rect ? (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            left: rect.left - 8,
            top: rect.top - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            zIndex: 81,
            pointerEvents: 'none',
            borderRadius: 12,
            boxShadow:
              '0 0 0 2px var(--color-brand-primary), 0 0 24px 6px rgba(220, 76, 42, 0.45)',
          }}
        />
      ) : null}

      <motion.div
        key={index}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ type: 'spring', damping: 22, stiffness: 240 }}
        style={popoverStyle}
        className="fixed z-[82] w-[calc(100vw-2rem)] max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-primary)]">
            Step {index + 1} of {total}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.06] hover:text-[var(--color-text-primary)]"
            aria-label="Skip tour"
          >
            <X className="size-4" />
          </button>
        </div>
        <h3 className="mt-2 font-display text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
          {step.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {step.body}
        </p>

        {/* Progress pills */}
        <div className="mt-4 flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={
                i === index
                  ? 'h-1 w-6 rounded-full bg-[var(--color-brand-primary)]'
                  : i < index
                    ? 'h-1 w-3 rounded-full bg-[var(--color-brand-primary)]/40'
                    : 'h-1 w-3 rounded-full bg-[var(--color-border-default)]'
              }
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-[var(--color-text-tertiary)] underline-offset-4 hover:text-[var(--color-text-secondary)] hover:underline"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <Button size="sm" variant="ghost" onClick={onPrev}>
                Back
              </Button>
            ) : null}
            <Button size="sm" onClick={onNext}>
              {index === total - 1 ? "Let's go" : 'Next'}
              {index === total - 1 ? null : <ArrowRight className="size-3.5" />}
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/**
 * Returns inline CSS positioning for the popover. If no rect, centres
 * it. Otherwise places it on the configured side of the target with
 * viewport clamping so it never bleeds offscreen.
 */
function computePopoverPosition(
  rect: DOMRect | null,
  placement: Step['placement'] = 'bottom',
): React.CSSProperties {
  if (!rect || typeof window === 'undefined') {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  const gap = 16;
  const popW = 360; // approximate; matches max-w-md (~448) minus padding
  const popH = 220;
  let left = rect.left + rect.width / 2 - popW / 2;
  let top = rect.bottom + gap;
  if (placement === 'top') top = rect.top - popH - gap;
  if (placement === 'left') {
    left = rect.left - popW - gap;
    top = rect.top + rect.height / 2 - popH / 2;
  }
  if (placement === 'right') {
    left = rect.right + gap;
    top = rect.top + rect.height / 2 - popH / 2;
  }
  // Clamp to viewport
  const margin = 16;
  left = Math.max(margin, Math.min(window.innerWidth - popW - margin, left));
  top = Math.max(margin, Math.min(window.innerHeight - popH - margin, top));
  return { left, top };
}
