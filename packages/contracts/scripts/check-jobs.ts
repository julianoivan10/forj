/**
 * List the most recent jobs via the public tRPC `job.list` endpoint.
 * Used by the E2E test runbook to verify a job posted successfully.
 *
 *   pnpm --filter @forj/contracts exec hardhat run \
 *     scripts/check-jobs.ts --network hardhat
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

async function main() {
  const url = `${APP_URL}/api/trpc/job.list?input=${encodeURIComponent(
    JSON.stringify({ json: { limit: 5 } }),
  )}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`HTTP ${res.status}`);
    process.exitCode = 1;
    return;
  }
  const body = (await res.json()) as {
    result?: { data?: { json?: { items?: Array<Record<string, unknown>> } } };
  };
  const items = body.result?.data?.json?.items ?? [];
  console.log(`\nMost recent ${items.length} jobs:\n`);
  for (const j of items) {
    console.log(`  • ${j.title}`);
    console.log(`     id:     ${j.id}`);
    console.log(`     slug:   ${j.slug}`);
    console.log(`     status: ${j.status}`);
    console.log(`     budget: $${j.budgetMin} – $${j.budgetMax} (${j.budgetType})`);
    console.log(`     posted: ${j.createdAt}`);
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
