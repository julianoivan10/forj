import hre from 'hardhat';
import { isAddress } from 'viem';
import { BASE_SEPOLIA, BASE } from '../src/index';

/**
 * Hands the **active Forj escrow** off to a Safe multisig.
 *
 * What this does, in order:
 *   1. Reads the target multisig from `NEXT_PUBLIC_MULTISIG_ADDRESS`.
 *   2. Loads the deployed escrow address for the current Hardhat
 *      network from `addresses.ts` (BASE / BASE_SEPOLIA).
 *   3. Calls `setFeeRecipient(multisig)` so platform fees flow to the
 *      multisig treasury starting on the next release. Safe to do
 *      *before* ownership handoff because the deployer is still owner.
 *   4. Calls `transferOwnership(multisig)`. This is the **first leg**
 *      of OpenZeppelin's `Ownable2Step` — it sets `pendingOwner` to
 *      the multisig but does NOT change `owner()` yet. The multisig
 *      must then call `acceptOwnership()` from a Safe transaction to
 *      complete the handoff (see MULTISIG_HANDOFF.md for the exact
 *      Safe Transaction Builder JSON).
 *
 * Why two-step (Ownable2Step) and not a single `transferOwnership`:
 *   The 2-step pattern protects against typos and against transferring
 *   to a contract that can't actually receive admin privileges. If
 *   step 3 fired and the new owner couldn't call `acceptOwnership()`,
 *   the contract would be permanently un-administrable. With 2-step,
 *   the old owner stays in charge until the new owner proves they can
 *   sign a tx.
 *
 * Required env (caller's shell, picked up by `hardhat.config.ts`):
 *   - DEPLOYER_PRIVATE_KEY        — MUST be the current `owner()`.
 *                                   This script reverts loudly if not.
 *   - NEXT_PUBLIC_MULTISIG_ADDRESS — target Safe address.
 *
 * Optional env:
 *   - SKIP_FEE_RECIPIENT=1        — only transfer ownership, don't
 *                                   touch fee recipient. Useful if
 *                                   the recipient is already pointing
 *                                   to the multisig.
 *
 * Idempotency:
 *   - If `pendingOwner()` already equals the multisig, the script
 *     short-circuits the transferOwnership call. Same for fee
 *     recipient — already-set is treated as success.
 *
 * Run:
 *   pnpm --filter @forj/contracts hardhat run \
 *     scripts/transfer-ownership.ts --network baseSepolia
 */
async function main() {
  const network = hre.network.name;
  const chainCfg =
    network === 'base' ? BASE : network === 'baseSepolia' ? BASE_SEPOLIA : null;
  if (!chainCfg) {
    throw new Error(
      `Refusing to run on network "${network}" — only \`base\` and \`baseSepolia\` are wired up.`,
    );
  }
  if (!chainCfg.escrow) {
    throw new Error(
      `No escrow address on file for ${network} in addresses.ts. Deploy first.`,
    );
  }

  const multisig = process.env.NEXT_PUBLIC_MULTISIG_ADDRESS;
  if (!multisig || !isAddress(multisig)) {
    throw new Error(
      'NEXT_PUBLIC_MULTISIG_ADDRESS env var is missing or not a valid 0x… address.',
    );
  }

  const [signer] = await hre.viem.getWalletClients();
  const escrow = await hre.viem.getContractAt('ForjEscrow', chainCfg.escrow);

  // Read current state so we can show a clean before/after and avoid
  // sending no-op transactions (which still cost gas).
  const [currentOwner, pendingOwner, currentFeeRecipient] = await Promise.all([
    escrow.read.owner(),
    escrow.read.pendingOwner(),
    escrow.read.feeRecipient(),
  ]);

  console.log(`\nTransfer ownership of ForjEscrow on ${network}`);
  console.log(`  escrow:           ${chainCfg.escrow}`);
  console.log(`  signer:           ${signer.account.address}`);
  console.log(`  target multisig:  ${multisig}`);
  console.log(`  current owner:    ${currentOwner}`);
  console.log(`  pending owner:    ${pendingOwner === '0x0000000000000000000000000000000000000000' ? '(none)' : pendingOwner}`);
  console.log(`  fee recipient:    ${currentFeeRecipient}`);

  // Guard: if the signer isn't the owner, the on-chain call will
  // revert with `OwnableUnauthorizedAccount` — bail early with a
  // clearer message.
  if (currentOwner.toLowerCase() !== signer.account.address.toLowerCase()) {
    throw new Error(
      `Signer (${signer.account.address}) is not the current owner (${currentOwner}). ` +
        `Set DEPLOYER_PRIVATE_KEY to the key that controls the current owner.`,
    );
  }

  // Step 1: setFeeRecipient — separate from ownership transfer so the
  // treasury switches to the multisig immediately, even if the human
  // multisig signers take a few days to wrap up acceptOwnership.
  const skipFeeRecipient = process.env.SKIP_FEE_RECIPIENT === '1';
  if (skipFeeRecipient) {
    console.log(`\n[skipped] setFeeRecipient — SKIP_FEE_RECIPIENT=1`);
  } else if (currentFeeRecipient.toLowerCase() === multisig.toLowerCase()) {
    console.log(`\n[skipped] setFeeRecipient — already ${multisig}`);
  } else {
    console.log(`\n→ setFeeRecipient(${multisig})`);
    const hash = await escrow.write.setFeeRecipient([multisig as `0x${string}`]);
    console.log(`  tx: ${hash}`);
    const publicClient = await hre.viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  mined in block ${receipt.blockNumber}, status: ${receipt.status}`);
    if (receipt.status !== 'success') {
      throw new Error('setFeeRecipient reverted on-chain.');
    }
  }

  // Step 2: transferOwnership — first leg of Ownable2Step. After this
  // the multisig is `pendingOwner` but `owner()` is unchanged. The
  // multisig must call `acceptOwnership()` to finalise.
  if (pendingOwner.toLowerCase() === multisig.toLowerCase()) {
    console.log(`\n[skipped] transferOwnership — pendingOwner already ${multisig}`);
  } else {
    console.log(`\n→ transferOwnership(${multisig})`);
    const hash = await escrow.write.transferOwnership([multisig as `0x${string}`]);
    console.log(`  tx: ${hash}`);
    const publicClient = await hre.viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  mined in block ${receipt.blockNumber}, status: ${receipt.status}`);
    if (receipt.status !== 'success') {
      throw new Error('transferOwnership reverted on-chain.');
    }
  }

  // Post-state for the operator's records.
  const [newOwner, newPending, newRecipient] = await Promise.all([
    escrow.read.owner(),
    escrow.read.pendingOwner(),
    escrow.read.feeRecipient(),
  ]);
  console.log(`\nPost-state:`);
  console.log(`  owner:            ${newOwner}`);
  console.log(`  pending owner:    ${newPending === '0x0000000000000000000000000000000000000000' ? '(none)' : newPending}`);
  console.log(`  fee recipient:    ${newRecipient}`);

  console.log(`\nNext step — the multisig must call acceptOwnership() to take ownership.`);
  console.log(`See MULTISIG_HANDOFF.md for the Safe Transaction Builder JSON to upload.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
