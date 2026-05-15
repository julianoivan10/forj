/**
 * Preflight check for `deploy:sepolia`.
 *
 * Run before the actual deploy to validate:
 *   1. DEPLOYER_PRIVATE_KEY is set + parsable
 *   2. PLATFORM_FEE_RECIPIENT is a valid 0x-address
 *   3. The deployer wallet has enough Sepolia ETH for gas
 *   4. The RPC URL responds
 *   5. USDC contract address resolves on the target chain
 *
 * Usage:
 *   pnpm --filter @forj/contracts exec hardhat run scripts/preflight.ts --network baseSepolia
 *
 * The script never moves funds — read-only checks only. Safe to run as
 * many times as needed.
 */

import hre from 'hardhat';
import { formatEther, isAddress } from 'viem';
import { BASE_SEPOLIA } from '../src';

const MIN_GAS_ETH = 0.01; // ~enough for one deploy tx on Base Sepolia

async function main() {
  const network = hre.network.name;
  const lines: Array<{ ok: boolean; label: string; detail?: string }> = [];

  // 1. Network expectation
  if (network !== 'baseSepolia') {
    lines.push({
      ok: false,
      label: 'Wrong network',
      detail: `Expected baseSepolia, got ${network}. Add --network baseSepolia.`,
    });
    print(lines);
    process.exitCode = 1;
    return;
  }
  lines.push({ ok: true, label: `Network = baseSepolia (chainId 84532)` });

  // 2. Deployer key
  const [signer] = await hre.viem.getWalletClients();
  if (!signer) {
    lines.push({
      ok: false,
      label: 'No deployer signer',
      detail:
        'DEPLOYER_PRIVATE_KEY is missing or malformed. Must be 64 hex chars (with or without 0x prefix).',
    });
    print(lines);
    process.exitCode = 1;
    return;
  }
  lines.push({
    ok: true,
    label: 'Deployer signer loaded',
    detail: signer.account.address,
  });

  // 3. Fee recipient address
  const feeRecipient = process.env.PLATFORM_FEE_RECIPIENT?.trim();
  if (!feeRecipient || !isAddress(feeRecipient)) {
    lines.push({
      ok: false,
      label: 'Invalid PLATFORM_FEE_RECIPIENT',
      detail: feeRecipient
        ? `"${feeRecipient}" is not a valid 0x-address`
        : 'env var is empty',
    });
  } else {
    const sameAsDeployer =
      feeRecipient.toLowerCase() === signer.account.address.toLowerCase();
    lines.push({
      ok: true,
      label: `Fee recipient = ${feeRecipient}`,
      detail: sameAsDeployer
        ? '⚠ same as deployer — for testnet that is fine, but switch to a separate multisig for prod.'
        : 'separate from deployer (good).',
    });
  }

  // 4. RPC reachability + balance
  const publicClient = await hre.viem.getPublicClient();
  let block: bigint;
  try {
    block = await publicClient.getBlockNumber();
  } catch (err) {
    lines.push({
      ok: false,
      label: 'RPC unreachable',
      detail: `Check NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL. Underlying: ${(err as Error).message}`,
    });
    print(lines);
    process.exitCode = 1;
    return;
  }
  lines.push({ ok: true, label: `RPC alive`, detail: `head block = ${block}` });

  const balance = await publicClient.getBalance({ address: signer.account.address });
  const balanceEth = Number(formatEther(balance));
  const enoughEth = balanceEth >= MIN_GAS_ETH;
  lines.push({
    ok: enoughEth,
    label: `Deployer balance = ${balanceEth.toFixed(6)} ETH`,
    detail: enoughEth
      ? 'enough for one deploy tx.'
      : `need at least ${MIN_GAS_ETH} ETH. Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet`,
  });

  // 5. USDC reachability
  try {
    const decimals = (await publicClient.readContract({
      address: BASE_SEPOLIA.usdc,
      abi: [
        {
          type: 'function',
          name: 'decimals',
          inputs: [],
          outputs: [{ type: 'uint8' }],
          stateMutability: 'view',
        },
      ] as const,
      functionName: 'decimals',
    })) as number;
    if (decimals !== 6) {
      lines.push({
        ok: false,
        label: `USDC at ${BASE_SEPOLIA.usdc} has decimals=${decimals}`,
        detail: 'Expected 6. Address may be wrong for this chain.',
      });
    } else {
      lines.push({
        ok: true,
        label: `USDC reachable at ${BASE_SEPOLIA.usdc}`,
        detail: '6 decimals confirmed.',
      });
    }
  } catch (err) {
    lines.push({
      ok: false,
      label: 'USDC contract not reachable',
      detail: (err as Error).message,
    });
  }

  print(lines);

  const anyFailed = lines.some((l) => !l.ok);
  if (anyFailed) {
    console.log(
      '\n✗ Preflight failed. Fix the items above before running deploy:sepolia.\n',
    );
    process.exitCode = 1;
  } else {
    console.log('\n✓ All checks passed. You can run deploy:sepolia.\n');
  }
}

function print(lines: Array<{ ok: boolean; label: string; detail?: string }>) {
  console.log('\nDeploy preflight — Base Sepolia\n');
  for (const l of lines) {
    const sym = l.ok ? '✓' : '✗';
    console.log(`  ${sym} ${l.label}`);
    if (l.detail) console.log(`    ↳ ${l.detail}`);
  }
}

main().catch((err) => {
  console.error('Preflight crashed:', err);
  process.exitCode = 1;
});
