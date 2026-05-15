import { http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { createConfig } from '@privy-io/wagmi';

/**
 * Wagmi configuration.
 *
 * **Important**: we import `createConfig` from `@privy-io/wagmi`, NOT from
 * `wagmi` directly. The Privy package wires its embedded-wallet connector
 * AND the external-wallet (MetaMask, Coinbase, WalletConnect) connectors
 * through Privy's modal so a single sign-in flow handles all of them.
 *
 * If you swap this for the raw `wagmi` `createConfig`, external wallet
 * connections silently fail — `useConnect`/`useAccount` work but the
 * user's wallet never gets its address read into wagmi state because the
 * Privy session controller doesn't see it. That manifested as "failed
 * to connect MetaMask" with no useful console error.
 *
 * Reference:
 *   https://docs.privy.io/wallets/using-wallets/ethereum/connecting-external-wallets
 */
const baseRpc =
  process.env.NEXT_PUBLIC_BASE_RPC_URL && process.env.NEXT_PUBLIC_BASE_RPC_URL.length > 0
    ? process.env.NEXT_PUBLIC_BASE_RPC_URL
    : undefined;
const sepoliaRpc =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL &&
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL.length > 0
    ? process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
    : undefined;

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  // `http()` falls back to the chain's default RPC when no URL is provided.
  // Public Base RPCs are heavily rate-limited; production should set the
  // `NEXT_PUBLIC_BASE_*_RPC_URL` env vars to dedicated endpoints
  // (Alchemy / QuickNode / Infura).
  transports: {
    [base.id]: http(baseRpc),
    [baseSepolia.id]: http(sepoliaRpc),
  },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
