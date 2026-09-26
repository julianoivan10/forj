import hre from 'hardhat';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { getAddress, isAddress, type Address } from 'viem';
import { BASE, BASE_SEPOLIA, DEFAULT_CLIENT_FEE_BPS, DEFAULT_FREELANCER_FEE_BPS } from '../src/index';

/**
 * Deploy ForjEscrowV3.
 *
 *   pnpm --filter @forj/contracts deploy:v3:sepolia
 *
 * Roles (env, all optional on testnet — default to the deployer):
 *   V3_OWNER          admin (fees, windows, arbiter, guardian, unpause).
 *                     Production: a TimelockController controlled by a Safe.
 *   V3_ARBITER        resolves disputes within the bounded split rule.
 *                     Production: a separate Safe, never the owner's signers alone.
 *   V3_GUARDIAN       may pause new funding only.
 *   V3_FEE_RECIPIENT  defaults to PLATFORM_FEE_RECIPIENT.
 *
 * Mainnet is refused unless ALLOW_MAINNET_DEPLOY=true AND
 * FORJ_V3_AUDIT_REPORT points at the external audit that covers this exact
 * source. Neither is set anywhere in this repository.
 */
function addr(name: string, fallback?: Address): Address {
  const raw = process.env[name] ?? fallback;
  if (!raw || !isAddress(raw)) throw new Error(`${name} is missing or not a valid address.`);
  return getAddress(raw);
}

async function main() {
  const network = hre.network.name;
  const target = network === 'base' ? BASE : network === 'baseSepolia' ? BASE_SEPOLIA : null;
  if (!target) throw new Error(`Refusing to deploy on "${network}". Use baseSepolia.`);
  if (network === 'base') {
    if (process.env.ALLOW_MAINNET_DEPLOY !== 'true' || !process.env.FORJ_V3_AUDIT_REPORT) {
      throw new Error(
        'Refusing to deploy ForjEscrowV3 to Base mainnet: requires ALLOW_MAINNET_DEPLOY=true and FORJ_V3_AUDIT_REPORT (external audit of this exact source).',
      );
    }
  }

  const [deployer] = await hre.viem.getWalletClients();
  if (!deployer) throw new Error('No deployer account. Set DEPLOYER_PRIVATE_KEY in packages/contracts/.env.deploy.');
  const publicClient = await hre.viem.getPublicClient();
  const me = deployer.account.address;

  const owner = addr('V3_OWNER', me);
  const arbiter = addr('V3_ARBITER', me);
  const guardian = addr('V3_GUARDIAN', me);
  const feeRecipient = addr('V3_FEE_RECIPIENT', process.env.PLATFORM_FEE_RECIPIENT as Address | undefined);

  // Preflight: token has code, deployer can pay, roles are sane.
  const usdcCode = await publicClient.getCode({ address: target.usdc });
  if (!usdcCode || usdcCode === '0x') throw new Error(`No contract at USDC ${target.usdc} on ${network}.`);
  const balance = await publicClient.getBalance({ address: me });
  if (balance === 0n) throw new Error(`Deployer ${me} has no ETH on ${network}.`);
  if (network === 'base' && (owner === me || arbiter === me)) {
    throw new Error('On mainnet the owner and arbiter must not be the deployer EOA.');
  }

  console.log(`\nDeploying ForjEscrowV3 on ${network} (chain ${target.chainId})`);
  console.log(`  deployer      ${me}`);
  console.log(`  USDC          ${target.usdc}`);
  console.log(`  owner         ${owner}`);
  console.log(`  arbiter       ${arbiter}`);
  console.log(`  guardian      ${guardian}`);
  console.log(`  feeRecipient  ${feeRecipient}`);
  console.log(`  fees          ${DEFAULT_CLIENT_FEE_BPS} bps client / ${DEFAULT_FREELANCER_FEE_BPS} bps freelancer`);

  const args = [target.usdc, owner, feeRecipient, arbiter, guardian, DEFAULT_CLIENT_FEE_BPS, DEFAULT_FREELANCER_FEE_BPS] as const;
  const { contract, deploymentTransaction } = await hre.viem.sendDeploymentTransaction('ForjEscrowV3', [...args]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction.hash, confirmations: 2 });
  const escrow = await hre.viem.getContractAt('ForjEscrowV3', contract.address);

  // Read back every parameter before anyone relies on the deployment.
  const checks: Array<[string, unknown, unknown]> = [
    ['usdc', getAddress(await escrow.read.usdc()), getAddress(target.usdc)],
    ['owner', getAddress(await escrow.read.owner()), owner],
    ['arbiter', getAddress(await escrow.read.arbiter()), arbiter],
    ['guardian', getAddress(await escrow.read.guardian()), guardian],
    ['feeRecipient', getAddress(await escrow.read.feeRecipient()), feeRecipient],
    ['clientFeeBps', await escrow.read.defaultClientFeeBps(), DEFAULT_CLIENT_FEE_BPS],
    ['freelancerFeeBps', await escrow.read.defaultFreelancerFeeBps(), DEFAULT_FREELANCER_FEE_BPS],
    ['paused', await escrow.read.paused(), false],
  ];
  for (const [name, actual, expected] of checks) {
    if (actual !== expected) throw new Error(`Post-deploy check failed: ${name}=${String(actual)} expected ${String(expected)}`);
  }

  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse HEAD').toString().trim();
  } catch {
    // not a git checkout
  }
  const record = {
    contract: 'ForjEscrowV3',
    network,
    chainId: target.chainId,
    address: contract.address,
    deployBlock: receipt.blockNumber.toString(),
    txHash: deploymentTransaction.hash,
    deployer: me,
    constructorArgs: args.map(String),
    gitCommit: commit,
    workingTreeDirty: (() => {
      try {
        return execSync('git status --porcelain').toString().trim().length > 0;
      } catch {
        return null;
      }
    })(),
    deployedAt: new Date().toISOString(),
  };
  const dir = resolve(__dirname, '..', 'deployments');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${network}-ForjEscrowV3.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\n✔ ForjEscrowV3 at ${contract.address} (block ${receipt.blockNumber})`);
  console.log(`  record: ${file}`);

  if (process.env.SKIP_VERIFY !== 'true') {
    try {
      await hre.run('verify:verify', { address: contract.address, constructorArguments: [...args] });
    } catch (err) {
      console.warn(`Verification did not complete: ${(err as Error).message}`);
    }
  }

  console.log(`\nNext steps:
  1. packages/contracts/src/addresses.ts → escrowV3: '${contract.address}', escrowV3DeployBlock: ${receipt.blockNumber}n
  2. pnpm --filter @forj/contracts build
  3. Add ${contract.address} to the Pimlico sponsorship policy (smart-wallet users).
  4. Before public testnet: transferOwnership to the Safe/timelock, setArbiter to the arbiter Safe.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
