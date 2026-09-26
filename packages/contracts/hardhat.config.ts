// Individual plugins instead of the meta `hardhat-toolbox-viem` — keeps the
// peer-dep tree thin and avoids pulling in Hardhat 3 / Ignition / coverage
// before we actually need them.
import '@nomicfoundation/hardhat-viem';
import '@nomicfoundation/hardhat-network-helpers';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-verify';

// Load `.env` from the monorepo root (two levels up from this file).
// The repo's single `.env` lives at `<repo>/.env`. Without an explicit
// path, `dotenv` would look in CWD = `packages/contracts/` which is empty,
// and the deploy would fail with "DEPLOYER_PRIVATE_KEY missing".
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Deployment secrets belong in packages/contracts/.env.deploy (gitignored),
// NOT in the root .env that the web app loads. The root file is still read
// for shared, non-secret values (RPC URLs), but a deployer key found only
// there triggers a warning.
const deployEnv = resolve(__dirname, '.env.deploy');
if (existsSync(deployEnv)) dotenvConfig({ path: deployEnv });
const keyFromDeployFile = Boolean(process.env.DEPLOYER_PRIVATE_KEY);
dotenvConfig({ path: resolve(__dirname, '..', '..', '.env') });
if (!keyFromDeployFile && process.env.DEPLOYER_PRIVATE_KEY && process.argv.some((a) => a.includes('deploy') || a === 'verify')) {
  console.warn(
    '[hardhat] DEPLOYER_PRIVATE_KEY was loaded from the shared root .env. Move it to packages/contracts/.env.deploy so the web app never has it in its environment.',
  );
}

import type { HardhatUserConfig } from 'hardhat/config';

/**
 * Hardhat config for the Forj on-chain escrow contracts.
 *
 * Networks:
 *  - `baseSepolia` (84532) — testnet, used for all dev + staging
 *  - `base`        (8453)  — mainnet, used only for production deploys
 *
 * Secrets (read from `.env` at repo root, fall through harmlessly if absent
 * so `pnpm typecheck` / `pnpm compile` work locally without keys):
 *  - DEPLOYER_PRIVATE_KEY     — EOA that signs deploy txs
 *  - BASE_RPC_URL             — Mainnet RPC (Alchemy/QuickNode/Infura)
 *  - BASE_SEPOLIA_RPC_URL     — Sepolia RPC
 *  - BASESCAN_API_KEY         — for `hardhat verify` on Etherscan-on-Base
 */
/**
 * Normalise the deployer private key. Accepts either format:
 *   - `0x` + 64 hex chars (66 total)  ← what MetaMask "Show private key" returns
 *   - 64 hex chars without prefix     ← raw hex from some wallets / vaults
 *
 * If neither format matches we leave `accounts` empty so `pnpm typecheck`
 * still works without a key configured. The deploy script will surface
 * a clear "no signer" error instead of a cryptic Hardhat trace.
 */
const RAW_KEY = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const NORMALISED_KEY = (() => {
  if (!RAW_KEY) return null;
  const stripped = RAW_KEY.startsWith('0x') || RAW_KEY.startsWith('0X')
    ? RAW_KEY.slice(2)
    : RAW_KEY;
  // Must be exactly 64 hex chars after stripping the optional 0x.
  if (!/^[0-9a-fA-F]{64}$/.test(stripped)) return null;
  return `0x${stripped}` as const;
})();
const accounts = NORMALISED_KEY ? [NORMALISED_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      // Optimizer is *on* — escrow funcs are called per-contract by users,
      // so trim per-call gas. 200 runs is the standard middle-ground.
      optimizer: { enabled: true, runs: 200 },
      // viaIR pulls another ~10-15% gas off complex code paths via the
      // intermediate representation pipeline. Adds compile time but worth it
      // for a contract that will be the platform's hot path.
      viaIR: true,
      evmVersion: 'cancun',
    },
  },
  networks: {
    hardhat: {
      // Local dev chain — used for `hardhat test` automatically.
      chainId: 31337,
    },
    baseSepolia: {
      // The frontend env uses NEXT_PUBLIC_-prefixed RPC URLs because Next.js
      // exposes those to the browser. Hardhat is a Node script so it accepts
      // either prefix — pick whichever is set so users don't have to
      // duplicate the same URL with two different names.
      url:
        process.env.BASE_SEPOLIA_RPC_URL ??
        process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ??
        'https://sepolia.base.org',
      chainId: 84532,
      accounts,
    },
    base: {
      url:
        process.env.BASE_RPC_URL ??
        process.env.NEXT_PUBLIC_BASE_RPC_URL ??
        'https://mainnet.base.org',
      chainId: 8453,
      accounts,
    },
  },
  etherscan: {
    // Etherscan V2 unified API — one key works across mainnet + every L2
    // (Base, Base Sepolia, etc) via the single `api.etherscan.io/v2` endpoint.
    // The legacy per-network customChains config was deprecated end of May
    // 2025; the v2 SDK auto-detects the chain from the network's chainId.
    //
    // Get a key from https://etherscan.io/myapikey (NOT basescan.org —
    // Basescan keys still work but are routed through the unified endpoint
    // now too).
    apiKey: process.env.BASESCAN_API_KEY ?? process.env.ETHERSCAN_API_KEY ?? '',
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
