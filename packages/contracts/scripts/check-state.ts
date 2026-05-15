/**
 * One-shot test-progression checker. Reads jobs, proposals, contracts via
 * the public tRPC endpoints to verify each phase of the runbook landed
 * server-side without surfing the dashboard manually.
 *
 *   pnpm --filter @forj/contracts exec hardhat run \
 *     scripts/check-state.ts --network hardhat
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

async function fetchJSON<T>(path: string): Promise<T | null> {
  const res = await fetch(`${APP_URL}${path}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: { data?: { json?: T } } };
  return body.result?.data?.json ?? null;
}

async function main() {
  console.log(`\nWorkChain test state — ${APP_URL}\n`);

  // Jobs
  const jobs = await fetchJSON<{ items?: Array<Record<string, unknown>> }>(
    `/api/trpc/job.list?input=${encodeURIComponent(
      JSON.stringify({ json: { limit: 5 } }),
    )}`,
  );
  const items = jobs?.items ?? [];
  console.log(`JOBS (${items.length}):`);
  for (const j of items) {
    console.log(`  • [${j.status}] ${j.title}`);
    console.log(`    id=${j.id}  proposals=${j.proposalCount}`);
  }
  console.log();

  // Proposals on Alice's job (need to query via owner). The list is
  // protected, so we can't read from here without auth. Instead we
  // surface the proposal count from the job row above.
  console.log('PROPOSALS:');
  console.log('  (proposal count above; use the dashboard for the full list)');
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
