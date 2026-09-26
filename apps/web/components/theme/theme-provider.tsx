'use client';

import * as React from 'react';

/**
 * Theme management — dark / light / system.
 *
 * Implementation notes:
 *   - The theme is applied by setting `data-theme="dark"` or `="light"` on
 *     `<html>`. The CSS in `theme.css` keys overrides off that attribute,
 *     so flipping it re-themes every consumer instantly without a re-render.
 *   - First-paint flicker is prevented by an inline script in `app/layout.tsx`
 *     (`ThemeScript` below). That script reads localStorage + system pref
 *     synchronously before React hydrates, so the user never sees the wrong
 *     theme.
 *   - We persist the *user's choice*, not the resolved theme. A user who
 *     picks "system" should follow OS-level changes even after a reload.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** What the user picked (light / dark / system). */
  theme: ThemePreference;
  /** What is actually applied right now (light / dark). */
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemePreference) => void;
  /** Convenience for a 3-way cycle button. */
  cycleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

// Note: still reads/writes the legacy `workchain:theme` key as a fallback
// during the rebrand transition so existing users don't lose their setting
// when the localStorage key changes. Forj-keyed value takes precedence.
const STORAGE_KEY = 'forj:theme';
const LEGACY_STORAGE_KEY = 'workchain:theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let switchTimer: ReturnType<typeof setTimeout> | undefined;

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // Colour transitions are enabled only for the duration of an actual
  // switch (see `.theme-switching` in theme.css), never on first paint.
  if (root.getAttribute('data-theme') !== resolved) {
    root.classList.add('theme-switching');
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => root.classList.remove('theme-switching'), 250);
  }
  root.setAttribute('data-theme', resolved);
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
}) {
  const [theme, setThemeState] = React.useState<ThemePreference>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>('dark');

  // Hydrate from localStorage on mount. We don't read it during initial state
  // setup because that would cause a hydration mismatch with the server-
  // rendered HTML — the inline ThemeScript already applied the right
  // attribute, but we still need React state to match.
  React.useEffect(() => {
    // Read forj-keyed first; fall back to legacy workchain key so users
    // who set their preference before the rebrand keep their choice.
    const stored = (window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY)) as ThemePreference | null;
    const initial =
      stored === 'light' || stored === 'dark' || stored === 'system'
        ? stored
        : defaultTheme;
    setThemeState(initial);
    const resolved = initial === 'system' ? getSystemTheme() : initial;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [defaultTheme]);

  // Watch system preference when the user picked "system".
  React.useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const resolved = mq.matches ? 'light' : 'dark';
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    const resolved = next === 'system' ? getSystemTheme() : next;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  const cycleTheme = React.useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  }, [theme, setTheme]);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme, cycleTheme }),
    [theme, resolvedTheme, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}

/**
 * Inline anti-FOUC script. Render this in `<head>` BEFORE any CSS-using
 * markup. It runs synchronously and applies the right `data-theme` before
 * the browser paints anything, so the user never sees a flash of the
 * wrong palette.
 *
 * Why dangerouslySetInnerHTML: this MUST execute synchronously inline.
 * A regular `<Script>` would defer past first paint.
 */
export function ThemeScript() {
  // Inline reader checks both keys — forj first, legacy workchain second —
  // so the very first paint already uses the user's saved preference even
  // if it lives under the old key.
  const code = `(function(){try{var pref=localStorage.getItem('${STORAGE_KEY}')||localStorage.getItem('${LEGACY_STORAGE_KEY}');var resolved=pref==='light'||pref==='dark'?pref:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',resolved);}catch(_){document.documentElement.setAttribute('data-theme','light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
