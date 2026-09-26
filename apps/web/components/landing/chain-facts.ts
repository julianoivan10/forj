import {
  DEFAULT_AUTO_RELEASE_WINDOW,
  DEFAULT_CLIENT_FEE_BPS,
  DEFAULT_FREELANCER_FEE_BPS,
  getAddresses,
} from '@forj/contracts';
import { APP_CHAIN_ID } from '@/lib/chain';

/**
 * Facts the landing page states about the deployed escrow. Everything is
 * derived from the same constants the app and contracts use, so marketing
 * copy can't drift from what users actually sign.
 */
const chainId = APP_CHAIN_ID;
const isMainnet = chainId === 8453;

function safeAddresses() {
  try {
    return getAddresses(chainId);
  } catch {
    return null;
  }
}

const addresses = safeAddresses();

export const CHAIN = {
  id: chainId,
  isMainnet,
  networkName: isMainnet ? 'Base' : 'Base Sepolia',
  stageLabel: isMainnet ? 'Live on Base' : 'Public testnet · Base Sepolia',
  explorer: isMainnet ? 'https://basescan.org' : 'https://sepolia.basescan.org',
  // New escrows use ForjEscrowV3 wherever it is deployed.
  escrow: addresses?.escrowV3 || addresses?.escrow || null,
  usdc: addresses?.usdc || null,
  multisig: process.env.NEXT_PUBLIC_MULTISIG_ADDRESS || null,
} as const;

export const FEES = {
  clientBps: DEFAULT_CLIENT_FEE_BPS,
  freelancerBps: DEFAULT_FREELANCER_FEE_BPS,
  clientLabel: `${DEFAULT_CLIENT_FEE_BPS / 100}%`,
  freelancerLabel: `${DEFAULT_FREELANCER_FEE_BPS / 100}%`,
  reviewDays: DEFAULT_AUTO_RELEASE_WINDOW / 86_400,
} as const;

const USDC_UNIT = 1_000_000n;

/**
 * Worked example in USDC base units (6 decimals) — integer math only,
 * same formula as `ForjEscrow.fund()` / `_releaseTo()`.
 */
export function feeExample(amountUsdc: bigint) {
  const amount = amountUsdc * USDC_UNIT;
  const clientFee = (amount * BigInt(FEES.clientBps)) / 10_000n;
  const freelancerFee = (amount * BigInt(FEES.freelancerBps)) / 10_000n;
  return {
    amount,
    deposit: amount + clientFee,
    payout: amount - freelancerFee,
    platform: clientFee + freelancerFee,
  };
}

/** Display-only formatting of base units, e.g. 1_050_000_000n → "1,050.00". */
export function formatUsdc(units: bigint): string {
  const whole = units / USDC_UNIT;
  const cents = (units % USDC_UNIT) / 10_000n;
  return `${whole.toLocaleString('en-US')}.${cents.toString().padStart(2, '0')}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
