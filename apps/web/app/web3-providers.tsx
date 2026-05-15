'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { WagmiProvider } from '@privy-io/wagmi';
import { PRIVY_APP_ID, privyConfig } from '@/lib/privy/config';
import { wagmiConfig } from '@/lib/wagmi/config';

const hasPrivy = PRIVY_APP_ID.length > 0 && PRIVY_APP_ID !== 'your-privy-app-id';

/**
 * Wraps children with Privy + Wagmi context. Lives in its own module so
 * `app/providers.tsx` can pull it in via `next/dynamic({ ssr: false })` —
 * this prevents Privy's transitive deps (Reown AppKit, MetaMask SDK) from
 * running their styled-components on the server, which causes a `<p> cannot
 * contain <div>` hydration mismatch even when the user picks email login.
 *
 * The trade-off: the auth-aware UI (login button, user menu, dashboard
 * gating) won't render on the very first server response — it pops in once
 * the dynamic chunk resolves on the client. This is fine because every one
 * of those surfaces is already client-only and gated on `privy.ready` anyway.
 */
export function Web3Providers({ children }: { children: React.ReactNode }) {
  if (!hasPrivy) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      {/*
        SmartWalletsProvider must sit INSIDE PrivyProvider (it uses the
        Privy session for the EOA signer) but OUTSIDE WagmiProvider (so
        wagmi sees the smart wallet address as the connected account, not
        the underlying EOA). The bundler + paymaster URLs come from the
        Privy dashboard config, NOT from this code — see PIMLICO-SETUP.md.

        When smart wallets aren't configured (no paymaster URL set in
        Privy dashboard), the provider is a no-op pass-through. The app
        still works through the EOA path. So this addition is safe to ship
        ahead of the dashboard configuration.
      */}
      <SmartWalletsProvider>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}

// Default export so `next/dynamic` can pick it up without a `.then` shim.
export default Web3Providers;
