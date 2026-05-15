/**
 * Send Sepolia ETH from the deployer wallet to two tester addresses
 * (Alice + Bob) so they have gas for the testnet end-to-end run.
 *
 * Usage:
 *   ALICE_WALLET=0x... BOB_WALLET=0x... [AMOUNT_ETH=0.01] \
 *     pnpm --filter @forj/contracts exec hardhat run \
 *       scripts/fund-testers.ts --network baseSepolia
 *
 * Defaults to 0.01 ETH per recipient (~enough for 8-10 escrow txs each).
 *
 * Why a script instead of manual sends:
 *   - One signer session, two transfers, predictable nonces.
 *   - Fails loud if the deployer doesn't have enough ETH (instead of one
 *     send succeeding and the second silently underfunding).
 *   - Validates recipient address shape before broadcasting.
 */

import hre from 'hardhat';
import { formatEther, isAddress, parseEther } from 'viem';

const DEFAULT_AMOUNT_ETH = '0.01';

async function main() {
  const alice = process.env.ALICE_WALLET?.trim();
  const bob = process.env.BOB_WALLET?.trim();
  const amountEth = process.env.AMOUNT_ETH?.trim() ?? DEFAULT_AMOUNT_ETH;

  if (!alice || !isAddress(alice)) {
    throw new Error(`ALICE_WALLET missing or invalid: "${alice}"`);
  }
  if (!bob || !isAddress(bob)) {
    throw new Error(`BOB_WALLET missing or invalid: "${bob}"`);
  }
  if (alice.toLowerCase() === bob.toLowerCase()) {
    throw new Error('ALICE_WALLET and BOB_WALLET must be different addresses.');
  }

  const amount = parseEther(amountEth);

  const [signer] = await hre.viem.getWalletClients();
  if (!signer) {
    throw new Error(
      'No deployer signer. Set DEPLOYER_PRIVATE_KEY in .env (66 chars w/ 0x or 64 chars raw).',
    );
  }

  const publicClient = await hre.viem.getPublicClient();
  const balance = await publicClient.getBalance({ address: signer.account.address });
  const needed = amount * 2n + parseEther('0.001'); // headroom for gas
  if (balance < needed) {
    throw new Error(
      `Deployer balance ${formatEther(balance)} ETH is below the ${formatEther(needed)} ETH ` +
        `needed (${amountEth} × 2 + ~0.001 gas headroom). Top up the deployer first.`,
    );
  }

  console.log(`\nFunding testers from ${signer.account.address}`);
  console.log(`  → Alice ${alice}: ${amountEth} ETH`);
  console.log(`  → Bob   ${bob}: ${amountEth} ETH\n`);

  const aliceTx = await signer.sendTransaction({
    to: alice as `0x${string}`,
    value: amount,
  });
  console.log(`  ✓ Alice tx: ${aliceTx}`);
  await publicClient.waitForTransactionReceipt({ hash: aliceTx });
  console.log(`    confirmed.`);

  const bobTx = await signer.sendTransaction({
    to: bob as `0x${string}`,
    value: amount,
  });
  console.log(`  ✓ Bob tx:   ${bobTx}`);
  await publicClient.waitForTransactionReceipt({ hash: bobTx });
  console.log(`    confirmed.`);

  // Final balance check so the operator sees the result without leaving
  // the terminal.
  const [finalAlice, finalBob, finalDeployer] = await Promise.all([
    publicClient.getBalance({ address: alice as `0x${string}` }),
    publicClient.getBalance({ address: bob as `0x${string}` }),
    publicClient.getBalance({ address: signer.account.address }),
  ]);
  console.log(`\nFinal balances:`);
  console.log(`  Alice:    ${formatEther(finalAlice)} ETH`);
  console.log(`  Bob:      ${formatEther(finalBob)} ETH`);
  console.log(`  Deployer: ${formatEther(finalDeployer)} ETH (remaining)\n`);

  console.log('✓ Both testers funded. Proceed to Phase 4 of TESTNET-RUNBOOK.md.\n');
}

main().catch((err) => {
  console.error('Fund-testers failed:', err);
  process.exitCode = 1;
});
