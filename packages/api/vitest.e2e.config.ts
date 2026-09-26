import { defineConfig } from 'vitest/config';

/**
 * Base Sepolia end-to-end suite. Real chain, real ForjEscrowV3, real Circle
 * test USDC; database is a migrated local Postgres (never the shared DB).
 *
 *   E2E_DATABASE_URL=postgres://…@127.0.0.1:…/forj_e2e \
 *   E2E_FUNDER_KEY=0x… \
 *   pnpm --filter @forj/api test:e2e
 *
 * The funder needs ~0.003 Sepolia ETH and ~6 test USDC per run; leftovers
 * are swept back to it at the end.
 */
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 10 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
    fileParallelism: false,
    sequence: { concurrent: false },
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? '',
      DATABASE_DRIVER: 'pg',
      NEXT_PUBLIC_CHAIN_ID: '84532',
      ADMIN_USER_IDS: '00000000-0000-4000-8000-0000000e2ead',
      FORJ_LOG_SILENT: '1',
    },
  },
});
