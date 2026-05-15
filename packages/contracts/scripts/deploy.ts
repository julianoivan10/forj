import hre from 'hardhat';
import { parseUnits } from 'viem';
import { BASE, BASE_SEPOLIA, DEFAULT_AUTO_RELEASE_WINDOW, DEFAULT_FEE_BPS } from '../src/index';

/**
 * Deploys WorkChainEscrow to whatever network Hardhat was invoked with.
 * Reads target USDC address from `src/addresses.ts` so we never accidentally
 * point at a wrong token.
 *
 * Required env (caller's shell, picked up by `hardhat.config.ts`):
 *   - DEPLOYER_PRIVATE_KEY        — funds the deploy tx
 *   - PLATFORM_FEE_RECIPIENT      — multisig that receives fees
 *
 * Optional env:
 *   - PLATFORM_FEE_BPS            — defaults to DEFAULT_FEE_BPS
 *   - AUTO_RELEASE_WINDOW_SECONDS — defaults to DEFAULT_AUTO_RELEASE_WINDOW
 */
async function main() {
  const network = hre.network.name;
  const usdc =
    network === 'base'
      ? BASE.usdc
      : network === 'baseSepolia'
        ? BASE_SEPOLIA.usdc
        : null;
  if (!usdc) {
    throw new Error(
      `Refusing to deploy on network "${network}" — only \`base\` and \`baseSepolia\` are wired up.`,
    );
  }

  const feeRecipient = process.env.PLATFORM_FEE_RECIPIENT;
  if (!feeRecipient || !/^0x[0-9a-fA-F]{40}$/.test(feeRecipient)) {
    throw new Error('PLATFORM_FEE_RECIPIENT env var is missing or not a valid address.');
  }

  const feeBps = Number(process.env.PLATFORM_FEE_BPS ?? DEFAULT_FEE_BPS);
  const window = Number(process.env.AUTO_RELEASE_WINDOW_SECONDS ?? DEFAULT_AUTO_RELEASE_WINDOW);

  const [deployer] = await hre.viem.getWalletClients();
  console.log(`\nDeploying WorkChainEscrow on ${network}`);
  console.log(`  deployer:       ${deployer.account.address}`);
  console.log(`  USDC:           ${usdc}`);
  console.log(`  feeRecipient:   ${feeRecipient}`);
  console.log(`  defaultFeeBps:  ${feeBps} (${feeBps / 100}%)`);
  console.log(`  autoRelease:    ${window}s (${window / 86_400} days)`);

  const escrow = await hre.viem.deployContract('WorkChainEscrow', [
    usdc,
    feeRecipient,
    feeBps,
    window,
    deployer.account.address,
  ]);

  console.log(`\n✔ Deployed at ${escrow.address}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Update \`packages/contracts/src/addresses.ts\` — set \`escrow\` for ${network}.`);
  console.log(`  2. Verify on Basescan:`);
  console.log(
    `     pnpm --filter @forj/contracts verify:sepolia ${escrow.address} \\\n        ${usdc} ${feeRecipient} ${feeBps} ${window} ${deployer.account.address}`,
  );

  // Sanity check — read back state immediately so we fail loud on any
  // constructor-arg mistake before anyone uses the contract.
  const onchainFee = await escrow.read.defaultFeeBps();
  const onchainWindow = await escrow.read.autoReleaseWindow();
  if (Number(onchainFee) !== feeBps || Number(onchainWindow) !== window) {
    throw new Error(`Post-deploy sanity check failed: fee=${onchainFee} window=${onchainWindow}`);
  }
  // Touch parseUnits so the import isn't dropped — useful when this script
  // is extended to do post-deploy mock funding on local networks.
  void parseUnits;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
