'use client';

import dynamic from 'next/dynamic';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { TRPCProvider } from '@/lib/trpc/provider';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { CommandPaletteProvider } from '@/components/search/command-palette-provider';
import { I18nProvider } from '@/lib/i18n/provider';

// Toast surface uses the Bauhaus charcoal + cream pairing so it sits as
// its own layer over either light or dark page chrome. Picking the
// theme-aware vars would have the toast bg flash white on light mode
// which fights with the vermillion accent inside.
// Toasts are drawn from the design tokens, so they follow paper / carbon.
const TOAST_STYLE = {
  background: 'var(--color-background-elevated)',
  border: '1px solid var(--color-border-strong)',
  color: 'var(--color-text-primary)',
  borderRadius: '3px',
  fontFamily: 'var(--font-body)',
  boxShadow: 'none',
};

/**
 * Web3 stack (Privy + Wagmi) is loaded client-only via `next/dynamic`.
 *
 * Why: Privy's wallet-detection layer pulls in Reown AppKit + MetaMask SDK,
 * both of which mount styled-components during render that emit a `<p>`
 * containing a `<div>` — a hydration error in React 19. Even when the user
 * only picks email login, those modules execute on import. Skipping SSR for
 * the entire Privy subtree is the cleanest fix; SSR was never doing
 * meaningful work here anyway because every consumer waits on `privy.ready`.
 *
 * The `loading` prop returns the children passthrough so that pre-resolution
 * the page still renders its content shell (landing page, public job pages
 * etc all work without auth context).
 */
const Web3Providers = dynamic(() => import('./web3-providers'), {
  ssr: false,
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system">
      {/* reducedMotion="user": every framer-motion animation honours the OS
          "reduce motion" setting (transforms are skipped, opacity kept). */}
      <MotionConfig reducedMotion="user">
      <I18nProvider>
        <TRPCProvider>
          <Web3Providers>
            <CommandPaletteProvider>
              {children}
            {/* Toasts sit bottom-right, away from the header's controls,
                and inherit the active theme through TOAST_STYLE. */}
              <Toaster
                theme="system"
                position="bottom-right"
                toastOptions={{ style: TOAST_STYLE }}
              />
            </CommandPaletteProvider>
          </Web3Providers>
        </TRPCProvider>
      </I18nProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
