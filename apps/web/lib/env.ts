import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DATABASE_URL_UNPOOLED: z.string().url().optional(),
    PRIVY_APP_SECRET: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    // UploadThing v7+ uses a single `UPLOADTHING_TOKEN`. The legacy SECRET
    // and APP_ID env vars are kept around so older `.env` files still load,
    // but the v7 SDK we're on now reads `UPLOADTHING_TOKEN` automatically.
    UPLOADTHING_TOKEN: z.string().min(1).optional(),
    UPLOADTHING_SECRET: z.string().min(1).optional(),
    UPLOADTHING_APP_ID: z.string().min(1).optional(),
    /**
     * Comma-separated DB user IDs allowed to call admin/dispute procs.
     * Empty / missing = nobody is admin (fail-closed). Must be set in
     * production for the arbiter to be able to access /admin/disputes.
     */
    ADMIN_USER_IDS: z.string().optional(),
    /**
     * Wallet address that receives platform fees (the `feeRecipient` arg
     * passed at WorkChainEscrow constructor time). Stored here so the
     * deploy script can pick it up; not used at request time by the API.
     */
    PLATFORM_FEE_RECIPIENT: z.string().optional(),
    /** Deployer key for `pnpm --filter @forj/contracts deploy:sepolia`. */
    DEPLOYER_PRIVATE_KEY: z.string().optional(),
    /** Basescan API key for `hardhat verify`. */
    BASESCAN_API_KEY: z.string().optional(),
    PINATA_API_KEY: z.string().min(1).optional(),
    PINATA_SECRET_KEY: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_APP_NAME: z.string().default('Forj'),
    NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
    NEXT_PUBLIC_BASE_RPC_URL: z.string().url(),
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: z.string().url(),
    NEXT_PUBLIC_CHAIN_ID: z.coerce.number(),
    NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS: z.string().optional(),
    NEXT_PUBLIC_REPUTATION_CONTRACT_ADDRESS: z.string().optional(),
    NEXT_PUBLIC_USDC_ADDRESS: z.string().min(1),
    NEXT_PUBLIC_TRANSAK_API_KEY: z.string().optional(),
    NEXT_PUBLIC_TRANSAK_ENV: z.enum(['STAGING', 'PRODUCTION']).default('STAGING'),
    NEXT_PUBLIC_PINATA_GATEWAY: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
    UPLOADTHING_SECRET: process.env.UPLOADTHING_SECRET,
    UPLOADTHING_APP_ID: process.env.UPLOADTHING_APP_ID,
    ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
    PLATFORM_FEE_RECIPIENT: process.env.PLATFORM_FEE_RECIPIENT,
    DEPLOYER_PRIVATE_KEY: process.env.DEPLOYER_PRIVATE_KEY,
    BASESCAN_API_KEY: process.env.BASESCAN_API_KEY,
    PINATA_API_KEY: process.env.PINATA_API_KEY,
    PINATA_SECRET_KEY: process.env.PINATA_SECRET_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NEXT_PUBLIC_BASE_RPC_URL: process.env.NEXT_PUBLIC_BASE_RPC_URL,
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
    NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS,
    NEXT_PUBLIC_REPUTATION_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_REPUTATION_CONTRACT_ADDRESS,
    NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS,
    NEXT_PUBLIC_TRANSAK_API_KEY: process.env.NEXT_PUBLIC_TRANSAK_API_KEY,
    NEXT_PUBLIC_TRANSAK_ENV: process.env.NEXT_PUBLIC_TRANSAK_ENV,
    NEXT_PUBLIC_PINATA_GATEWAY: process.env.NEXT_PUBLIC_PINATA_GATEWAY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
  emptyStringAsUndefined: true,
});
