import { DEFAULT_CLIENT_FEE_BPS, DEFAULT_FREELANCER_FEE_BPS } from '@forj/contracts';
import { formatUnits, parseUnits } from 'viem';

const USDC_DECIMALS = 6;

/**
 * Off-chain mirror of ForjEscrow v2's split fee, in integer USDC base
 * units (same formulas as `fund()` / `_releaseTo()`), returned as decimal
 * strings for the numeric DB columns.
 *
 *   platformFee      = clientFee + freelancerFee (everything Forj receives)
 *   freelancerAmount = amount - freelancerFee    (what the freelancer is paid)
 *
 * The previous float math applied the legacy v1 single 5% fee, so stored
 * payouts, `totalEarned` and proof pages disagreed with what the chain paid.
 */
export function splitContractAmount(totalAmount: string | number): {
  platformFee: string;
  freelancerAmount: string;
} {
  const amount = parseUnits(String(totalAmount), USDC_DECIMALS);
  const clientFee = (amount * BigInt(DEFAULT_CLIENT_FEE_BPS)) / 10_000n;
  const freelancerFee = (amount * BigInt(DEFAULT_FREELANCER_FEE_BPS)) / 10_000n;
  return {
    platformFee: formatUnits(clientFee + freelancerFee, USDC_DECIMALS),
    freelancerAmount: formatUnits(amount - freelancerFee, USDC_DECIMALS),
  };
}
