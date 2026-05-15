import type { PrivyClientConfig } from '@privy-io/react-auth';
import { base, baseSepolia } from 'viem/chains';

/**
 * Resolve the active chain at module load. The default falls back to Base
 * mainnet when the env var is missing — appropriate for production but a
 * common dev-time foot-gun (testers expect Sepolia). Set
 * `NEXT_PUBLIC_CHAIN_ID=84532` in `.env` for testnet runs.
 */
const chainIdEnv = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? base.id);
const defaultChainViem = chainIdEnv === baseSepolia.id ? baseSepolia : base;

const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? 'https://mainnet.base.org';
const sepoliaRpc =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org';

/**
 * Privy SDK config. The shape of the `defaultChain` / `supportedChains`
 * fields below is Privy's own (not viem's) — IDs + names + RPCs only.
 */
export const privyConfig: PrivyClientConfig = {
  loginMethods: ['email', 'google', 'twitter', 'wallet'],
  appearance: {
    theme: 'dark',
    accentColor: '#DC4C2A',
    logo: '/logo.svg',
    showWalletLoginFirst: false,
    // Display name shown in the wallet permission prompt (MetaMask etc).
    walletList: ['detected_wallets', 'metamask', 'coinbase_wallet', 'wallet_connect'],
  },
  embeddedWallets: {
    // Provision an embedded wallet for **every** authenticated user, even
    // those who connected an external wallet (MetaMask, Coinbase Wallet,
    // WalletConnect).
    //
    // Why `all-users` instead of `users-without-wallets`:
    //   The smart-wallet (ERC-4337) layer needs a Privy-managed signer
    //   under the hood. If a MetaMask user logs in without an embedded
    //   wallet, no smart wallet gets provisioned for them — they end up
    //   funding escrows from their MetaMask EOA, paying gas themselves,
    //   and seeing wallet popups for every action. That breaks the
    //   uniform "non-crypto-friendly" promise of the platform.
    //
    //   With `all-users`:
    //     1. MetaMask user signs in → Privy uses MetaMask as the auth
    //        method but still creates a separate embedded EOA.
    //     2. Smart wallet is deployed on top of that embedded EOA.
    //     3. MetaMask becomes optional plumbing (no popup on each tx),
    //        the smart wallet is the on-chain identity for the platform.
    //   Result: every user gets sponsored gas + batched txs regardless
    //   of how they signed in.
    createOnLogin: 'all-users',
    requireUserPasswordOnCreate: false,
  },
  defaultChain: {
    id: defaultChainViem.id,
    name: defaultChainViem.name,
    network: defaultChainViem.id === baseSepolia.id ? 'base-sepolia' : 'base',
    nativeCurrency: defaultChainViem.nativeCurrency,
    rpcUrls: {
      default: {
        http: [defaultChainViem.id === baseSepolia.id ? sepoliaRpc : baseRpc],
      },
      public: {
        http: [defaultChainViem.id === baseSepolia.id ? sepoliaRpc : baseRpc],
      },
    },
  },
  supportedChains: [
    {
      id: base.id,
      name: 'Base',
      network: 'base',
      nativeCurrency: base.nativeCurrency,
      rpcUrls: {
        default: { http: [baseRpc] },
        public: { http: ['https://mainnet.base.org'] },
      },
    },
    {
      id: baseSepolia.id,
      name: 'Base Sepolia',
      network: 'base-sepolia',
      nativeCurrency: baseSepolia.nativeCurrency,
      rpcUrls: {
        default: { http: [sepoliaRpc] },
        public: { http: ['https://sepolia.base.org'] },
      },
    },
  ],
  // External wallet support — required so MetaMask / Coinbase / WalletConnect
  // connectors initialise. Without this list explicitly enabled, Privy's
  // wallet-login flow silently no-ops on browsers that have an injected
  // wallet provider (the "Failed to connect MetaMask" footgun).
  externalWallets: {
    coinbaseWallet: { connectionOptions: 'all' },
  },
};

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
