/**
 * Read-only sanity check on a deployed WorkChainEscrow.
 *
 * Useful when the deploy script's own post-deploy sanity hit an RPC
 * propagation delay (the contract IS on-chain but the RPC hasn't picked
 * it up yet for read queries). Run a few seconds later and the read
 * succeeds.
 *
 * Usage:
 *   pnpm --filter @forj/contracts exec hardhat run scripts/verify-deployed.ts --network baseSepolia
 *
 * Pass the address via env: DEPLOYED_ADDRESS=0x...
 */

import hre from 'hardhat';
import { workChainEscrowAbi } from '../src/abi';

async function main() {
  const address = process.env.DEPLOYED_ADDRESS?.trim();
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('Set DEPLOYED_ADDRESS=0x... before running.');
  }

  const publicClient = await hre.viem.getPublicClient();
  console.log(`Reading from ${address} on ${hre.network.name}…\n`);

  // 1. Bytecode check — the cheapest "is this an actual deployed contract"
  //    test. Returns "0x" for an EOA or unfunded address.
  const bytecode = await publicClient.getBytecode({ address: address as `0x${string}` });
  if (!bytecode || bytecode === '0x') {
    console.log('  ✗ No bytecode at this address. Either the deploy failed or the wrong address.');
    process.exitCode = 1;
    return;
  }
  console.log(`  ✓ Bytecode present (${bytecode.length / 2 - 1} bytes)`);

  // 2. Read the constructor-set state. If any of these revert or return
  //    zero-data, something is wrong with the deploy.
  const [usdc, feeRecipient, defaultFeeBps, autoReleaseWindow, owner, nextEscrowId] =
    await Promise.all([
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: workChainEscrowAbi,
        functionName: 'usdc',
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: workChainEscrowAbi,
        functionName: 'feeRecipient',
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: workChainEscrowAbi,
        functionName: 'defaultFeeBps',
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: workChainEscrowAbi,
        functionName: 'autoReleaseWindow',
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: workChainEscrowAbi,
        functionName: 'owner',
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: workChainEscrowAbi,
        functionName: 'nextEscrowId',
      }),
    ]);

  console.log(`  ✓ usdc              = ${usdc}`);
  console.log(`  ✓ feeRecipient      = ${feeRecipient}`);
  console.log(`  ✓ defaultFeeBps     = ${defaultFeeBps} (${Number(defaultFeeBps) / 100}%)`);
  console.log(`  ✓ autoReleaseWindow = ${autoReleaseWindow}s (${Number(autoReleaseWindow) / 86_400} days)`);
  console.log(`  ✓ owner             = ${owner}`);
  console.log(`  ✓ nextEscrowId      = ${nextEscrowId}`);

  console.log(`\n✓ Contract is live and readable at ${address}\n`);
}

main().catch((err) => {
  console.error('Verify-deployed failed:', err);
  process.exitCode = 1;
});
