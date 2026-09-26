/**
 * The single chain this deployment runs on, from NEXT_PUBLIC_CHAIN_ID.
 *
 * No silent fallback: a production build without a valid value throws
 * instead of quietly pointing users at Base mainnet (the old default) or
 * at a testnet. Local development may omit it and gets Base Sepolia.
 */
export const BASE_MAINNET_ID = 8453;
export const BASE_SEPOLIA_ID = 84532;

function resolveAppChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  const id = raw ? Number(raw) : NaN;
  if (id === BASE_MAINNET_ID || id === BASE_SEPOLIA_ID) return id;
  if (process.env.NODE_ENV !== 'production') return BASE_SEPOLIA_ID;
  throw new Error(`NEXT_PUBLIC_CHAIN_ID must be ${BASE_MAINNET_ID} or ${BASE_SEPOLIA_ID} (got "${raw ?? ''}").`);
}

export const APP_CHAIN_ID = resolveAppChainId();
export const IS_MAINNET = APP_CHAIN_ID === BASE_MAINNET_ID;
