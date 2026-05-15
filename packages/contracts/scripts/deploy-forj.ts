import hre from 'hardhat';
import { parseUnits } from 'viem';
import {
  BASE,
  BASE_SEPOLIA,
  DEFAULT_AUTO_RELEASE_WINDOW,
  DEFAULT_CLIENT_FEE_BPS,
  DEFAULT_FREELANCER_FEE_BPS,
} from '../src/index';

/**
 * Deploys **ForjEscrow** (v2 split-fee variant) to the network Hardhat
 * was invoked with. The previous WorkChainEscrow stays deployed and
 * operational for any in-flight contracts — frontend just routes new
 * fund() calls to this v2 address once `addresses.ts` is updated.
 *
 * Required env (caller's shell, picked up by `hardhat.config.ts`):
 *   - DEPLOYER_PRIVATE_KEY        — funds the deploy tx
 *   - PLATFORM_FEE_RECIPIENT      — multisig (or personal during MVP) that
 *                                   receives both fee buckets at release
 *
 * Optional env:
 *   - PLATFORM_CLIENT_FEE_BPS     — defaults to DEFAULT_CLIENT_FEE_BPS (500 = 5%)
 *   - PLATFORM_FREELANCER_FEE_BPS — defaults to DEFAULT_FREELANCER_FEE_BPS (200 = 2%)
 *   - AUTO_RELEASE_WINDOW_SECONDS — defaults to DEFAULT_AUTO_RELEASE_WINDOW
 *
 * After running:
 *   1. Copy the deployed address into `packages/contracts/src/addresses.ts`
 *      (`escrow` field, same chain).
 *   2. Update `.env`:
 *        NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=<new address>
 *   3. Add the new address to your Pimlico sponsorship policy whitelist —
 *      otherwise smart-wallet fund() calls revert at the paymaster.
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

  const clientFeeBps = Number(
    process.env.PLATFORM_CLIENT_FEE_BPS ?? DEFAULT_CLIENT_FEE_BPS,
  );
  const freelancerFeeBps = Number(
    process.env.PLATFORM_FREELANCER_FEE_BPS ?? DEFAULT_FREELANCER_FEE_BPS,
  );
  const window = Number(
    process.env.AUTO_RELEASE_WINDOW_SECONDS ?? DEFAULT_AUTO_RELEASE_WINDOW,
  );

  const [deployer] = await hre.viem.getWalletClients();
  console.log(`\nDeploying ForjEscrow on ${network}`);
  console.log(`  deployer:                ${deployer.account.address}`);
  console.log(`  USDC:                    ${usdc}`);
  console.log(`  feeRecipient:            ${feeRecipient}`);
  console.log(`  defaultClientFeeBps:     ${clientFeeBps} (${clientFeeBps / 100}%)`);
  console.log(`  defaultFreelancerFeeBps: ${freelancerFeeBps} (${freelancerFeeBps / 100}%)`);
  console.log(`  autoRelease:             ${window}s (${window / 86_400} days)`);

  const escrow = await hre.viem.deployContract('ForjEscrow', [
    usdc,
    feeRecipient,
    clientFeeBps,
    freelancerFeeBps,
    window,
    deployer.account.address,
  ]);

  console.log(`\n✔ Deployed at ${escrow.address}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Update \`packages/contracts/src/addresses.ts\` — set \`escrow\` for ${network}.`);
  console.log(`  2. Update .env: NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=${escrow.address}`);
  console.log(`  3. Add ${escrow.address} to your Pimlico whitelist.`);
  console.log(`  4. Verify on Basescan:`);
  console.log(
    `     pnpm --filter @forj/contracts verify:sepolia ${escrow.address} \\\n        ${usdc} ${feeRecipient} ${clientFeeBps} ${freelancerFeeBps} ${window} ${deployer.account.address}`,
  );

  // Post-deploy sanity check — read every constructor-influenced piece of
  // state back so we fail loud on misconfig rather than discovering it
  // when the first user tries to fund.
  const onchainClient = await escrow.read.defaultClientFeeBps();
  const onchainFreelancer = await escrow.read.defaultFreelancerFeeBps();
  const onchainWindow = await escrow.read.autoReleaseWindow();
  if (
    Number(onchainClient) !== clientFeeBps ||
    Number(onchainFreelancer) !== freelancerFeeBps ||
    Number(onchainWindow) !== window
  ) {
    throw new Error(
      `Post-deploy sanity check failed: client=${onchainClient} freelancer=${onchainFreelancer} window=${onchainWindow}`,
    );
  }
  // Silence unused-import lint while keeping `parseUnits` available for
  // anyone extending this script to seed test data.
  void parseUnits;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
