'use client';

import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { TRPCProvider } from '@/lib/trpc/provider';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { CommandPaletteProvider } from '@/components/search/command-palette-provider';

// Toast surface uses the Bauhaus charcoal + cream pairing so it sits as
// its own layer over either light or dark page chrome. Picking the
// theme-aware vars would have the toast bg flash white on light mode
// which fights with the vermillion accent inside.
const TOAST_STYLE = {
  background: '#1E1C16',
  border: '1px solid rgba(234, 229, 218, 0.12)',
  color: '#EAE5DA',
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
    <ThemeProvider defaultTheme="dark">
      <TRPCProvider>
        <Web3Providers>
          <CommandPaletteProvider>
            {children}
            {/* Toaster theme stays "dark" because our toast styling uses dark
                brand colours regardless of the page theme — the toast surface
                is its own visual layer (like the Privy modal) and reads better
                with consistent contrast. */}
            <Toaster
              theme="dark"
              position="top-right"
              toastOptions={{ style: TOAST_STYLE }}
            />
          </CommandPaletteProvider>
        </Web3Providers>
      </TRPCProvider>
    </ThemeProvider>
  );
}
