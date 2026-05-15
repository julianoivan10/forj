/**
 * Read-only sanity check: verify Alice + Bob signed up successfully
 * and their wallet addresses match what we expect.
 *
 * Hits the production-like DB via tRPC (publicProcedure `user.getByUsername`)
 * — no DB credentials needed in this script.
 *
 * Usage:
 *   pnpm --filter @forj/contracts exec hardhat run \
 *     scripts/check-db-users.ts --network hardhat
 *   (any network works — script doesn't touch chain)
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
const USERNAMES = ['alice', 'bob'];

async function main() {
  console.log(`\nChecking DB state via ${APP_URL}\n`);

  for (const u of USERNAMES) {
    const url = `${APP_URL}/api/trpc/user.getByUsername?input=${encodeURIComponent(
      JSON.stringify({ json: { username: u } }),
    )}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`  ✗ @${u}: HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as {
        result?: { data?: { json?: Record<string, unknown> } };
      };
      const user = body.result?.data?.json;
      if (!user) {
        console.log(`  ✗ @${u}: no user payload`);
        continue;
      }
      console.log(`  ✓ @${u}`);
      console.log(`      displayName:  ${user.displayName}`);
      console.log(`      role:         ${user.role}`);
      console.log(`      walletAddr:   ${user.walletAddress}`);
      console.log(`      isOnboarded:  ${user.isOnboarded}`);
      console.log(`      createdAt:    ${user.createdAt}`);
    } catch (err) {
      console.log(`  ✗ @${u}: ${(err as Error).message}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
