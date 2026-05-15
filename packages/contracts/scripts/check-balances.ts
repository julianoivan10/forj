/**
 * Quick read-only balance checker for the testnet wallets.
 *
 * Usage:
 *   ALICE_WALLET=0x... BOB_WALLET=0x... \
 *     pnpm --filter @forj/contracts exec hardhat run \
 *       scripts/check-balances.ts --network baseSepolia
 */

import hre from 'hardhat';
import { formatEther, formatUnits } from 'viem';
import { BASE_SEPOLIA } from '../src';

async function main() {
  const alice = process.env.ALICE_WALLET?.trim();
  const bob = process.env.BOB_WALLET?.trim();
  if (!alice || !bob) throw new Error('Set ALICE_WALLET + BOB_WALLET env vars.');

  const publicClient = await hre.viem.getPublicClient();

  const [aliceEth, bobEth, aliceUsdc, bobUsdc] = await Promise.all([
    publicClient.getBalance({ address: alice as `0x${string}` }),
    publicClient.getBalance({ address: bob as `0x${string}` }),
    publicClient.readContract({
      address: BASE_SEPOLIA.usdc,
      abi: [
        {
          type: 'function',
          name: 'balanceOf',
          inputs: [{ name: 'a', type: 'address' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
      ] as const,
      functionName: 'balanceOf',
      args: [alice as `0x${string}`],
    }),
    publicClient.readContract({
      address: BASE_SEPOLIA.usdc,
      abi: [
        {
          type: 'function',
          name: 'balanceOf',
          inputs: [{ name: 'a', type: 'address' }],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
      ] as const,
      functionName: 'balanceOf',
      args: [bob as `0x${string}`],
    }),
  ]);

  console.log(`\nTester balances on Base Sepolia\n`);
  console.log(`Alice  ${alice}`);
  console.log(`  ETH:  ${formatEther(aliceEth)}`);
  console.log(`  USDC: ${formatUnits(aliceUsdc as bigint, 6)}`);
  console.log();
  console.log(`Bob    ${bob}`);
  console.log(`  ETH:  ${formatEther(bobEth)}`);
  console.log(`  USDC: ${formatUnits(bobUsdc as bigint, 6)}`);
  console.log();
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exitCode = 1;
});
