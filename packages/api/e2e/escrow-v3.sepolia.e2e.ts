import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { contracts, db, eq, escrowEvents, escrowTransactions, indexerCursors, jobs, proposals, users } from '@forj/db';
import { forjEscrowV3Abi } from '@forj/contracts';
import { createCaller } from '../src/root';
import { getEscrowV3Config, reconcileEscrows, syncEscrowLogs } from '../src/escrow-v3';

/**
 * Lifecycle end-to-end on Base Sepolia.
 *
 * What is real: ForjEscrowV3 (0x9813…c43b), Circle test USDC, signed
 * transactions from separate client / freelancer / arbiter keys, the tRPC
 * procedures, receipt verification, the log indexer and the reconciler,
 * and Postgres with the versioned migrations applied.
 *
 * What is NOT covered: the browser, Privy login and smart-wallet (UserOp)
 * signing. Those need a human in two browser profiles (docs/escrow/TESTNET-E2E.md).
 */

const funderKey = process.env.E2E_FUNDER_KEY as Hex | undefined;
if (!funderKey) throw new Error('E2E_FUNDER_KEY is required');
if (!process.env.DATABASE_URL?.includes('127.0.0.1')) throw new Error('E2E must run against a local database');

const USDC_ABI = parseAbi([
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);
const ADMIN_ID = '00000000-0000-4000-8000-0000000e2ead';

const cfg = getEscrowV3Config();
const pub = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org', { retryCount: 3 }) }) as PublicClient;
const wallet = (account: PrivateKeyAccount): WalletClient =>
  createWalletClient({ account, chain: baseSepolia, transport: http('https://sepolia.base.org', { retryCount: 3 }) });

const funder = privateKeyToAccount(funderKey); // also the testnet arbiter
const clientAcct = privateKeyToAccount(generatePrivateKey());
const freelancerAcct = privateKeyToAccount(generatePrivateKey());
const poorAcct = privateKeyToAccount(generatePrivateKey());

type Party = { id: string; account: PrivateKeyAccount };
let client: Party;
let freelancer: Party;
let stranger: Party;

async function send(account: PrivateKeyAccount, fn: string, args: readonly unknown[], opts: { gas?: bigint } = {}) {
  const hash = await wallet(account).writeContract({
    address: cfg.escrowAddress,
    abi: forjEscrowV3Abi,
    functionName: fn as never,
    args: args as never,
    account,
    chain: baseSepolia,
    ...(opts.gas ? { gas: opts.gas } : {}),
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

/** Balance at a specific block when given, so lagging RPC nodes can't skew assertions. */
async function usdc(address: Hex, blockNumber?: bigint) {
  return pub.readContract({ address: cfg.usdcAddress, abi: USDC_ABI, functionName: 'balanceOf', args: [address], ...(blockNumber ? { blockNumber } : {}) });
}

/**
 * Public Base RPC is load-balanced; a read right after a receipt can hit a
 * node a block behind. The reconciler is eventually consistent by design,
 * so tests wait for the chain to move past the last write before asserting.
 */
async function settle(blocks = 3n) {
  const target = (await pub.getBlockNumber()) + blocks;
  while ((await pub.getBlockNumber()) < target) await new Promise((r) => setTimeout(r, 1000));
}

function api(userId: string) {
  return createCaller({ db, user: { id: userId } as never, headers: new Headers() });
}

async function newContract(amount = '1.00') {
  const [job] = await db
    .insert(jobs)
    .values({
      clientId: client.id,
      title: `E2E job ${Date.now()}`,
      slug: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: 'End-to-end escrow lifecycle test on Base Sepolia.',
      category: 'development',
      skills: ['solidity'],
      budgetType: 'fixed',
      budgetMin: amount,
      budgetMax: amount,
      duration: 'less_than_week',
      experienceLevel: 'entry',
      status: 'in_progress',
    })
    .returning();
  const [proposal] = await db
    .insert(proposals)
    .values({ jobId: job!.id, freelancerId: freelancer.id, coverLetter: 'e2e', bidAmount: amount, bidType: 'fixed', estimatedDuration: '2 days', status: 'accepted' })
    .returning();
  const [row] = await db
    .insert(contracts)
    .values({
      jobId: job!.id,
      clientId: client.id,
      freelancerId: freelancer.id,
      proposalId: proposal!.id,
      title: 'E2E contract',
      totalAmount: amount,
      platformFee: '0.07',
      freelancerAmount: '0.98',
      paymentMethod: 'crypto',
      deliveryDeadline: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    })
    .returning();
  return row!.id;
}

async function row(contractId: string) {
  const r = await db.query.contracts.findFirst({ where: eq(contracts.id, contractId) });
  return r!;
}

/** Client prepares, approves and funds exactly the server-computed terms. */
async function fund(contractId: string, opts: { record?: boolean } = {}) {
  const t = await api(client.id).escrow.prepareFunding({ contractId });
  const w = wallet(clientAcct);
  const approve = await w.writeContract({
    address: t.usdcAddress,
    abi: USDC_ABI,
    functionName: 'approve',
    args: [t.escrowAddress, BigInt(t.total)],
    account: clientAcct,
    chain: baseSepolia,
  });
  await pub.waitForTransactionReceipt({ hash: approve });
  await settle(1n); // let every RPC node see the allowance before estimating fund()
  const { hash, receipt } = await send(clientAcct, 'fund', [
    t.contractRef,
    t.freelancer,
    BigInt(t.amount),
    BigInt(t.deliveryDeadline),
    t.maxClientFeeBps,
    t.maxFreelancerFeeBps,
  ]);
  if (opts.record !== false) {
    const r = await api(client.id).escrow.recordTransaction({ contractId, action: 'fund', txHash: hash, chainId: cfg.chainId });
    expect(r.outcome).toBe('confirmed');
  }
  return { hash, approve, terms: t, receipt };
}

async function record(p: Party, contractId: string, action: string, txHash: Hex, metadata?: Record<string, unknown>) {
  return api(p.id).escrow.recordTransaction({ contractId, action: action as never, txHash, chainId: cfg.chainId, metadata });
}

beforeAll(async () => {
  const [a, b, c, admin] = await db
    .insert(users)
    .values([
      { privyId: `e2e:client:${clientAcct.address}`, walletAddress: clientAcct.address.toLowerCase(), displayName: 'E2E Client' },
      { privyId: `e2e:freelancer:${freelancerAcct.address}`, walletAddress: freelancerAcct.address.toLowerCase(), displayName: 'E2E Freelancer' },
      { privyId: `e2e:stranger:${poorAcct.address}`, walletAddress: poorAcct.address.toLowerCase(), displayName: 'E2E Stranger' },
      { id: ADMIN_ID, privyId: `e2e:admin:${Date.now()}`, displayName: 'E2E Admin' },
    ])
    .onConflictDoNothing()
    .returning();
  client = { id: a!.id, account: clientAcct };
  freelancer = { id: b!.id, account: freelancerAcct };
  stranger = { id: c!.id, account: poorAcct };
  void admin;

  // Gas for all three test wallets, test USDC for the client (4 escrows × 1.05 + margin).
  const fw = wallet(funder);
  for (const to of [clientAcct.address, freelancerAcct.address, poorAcct.address]) {
    const h = await fw.sendTransaction({ to, value: parseEther('0.0006'), account: funder, chain: baseSepolia });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  const h = await fw.writeContract({ address: cfg.usdcAddress, abi: USDC_ABI, functionName: 'transfer', args: [clientAcct.address, 5_300_000n], account: funder, chain: baseSepolia });
  await pub.waitForTransactionReceipt({ hash: h });
});

afterAll(async () => {
  // Close every escrow this run opened, even if a test aborted midway: the
  // throwaway keys are discarded afterwards, so nothing may stay locked.
  const open = await db.query.contracts.findMany({ where: eq(contracts.clientId, client.id) });
  for (const c of open) {
    if (c.onChainContractId == null) continue;
    try {
      const e = await pub.readContract({ address: cfg.escrowAddress, abi: forjEscrowV3Abi, functionName: 'getEscrow', args: [BigInt(c.onChainContractId)] });
      if (e.status === 1 || e.status === 2 || e.status === 3) await send(freelancerAcct, 'cancelByFreelancer', [BigInt(c.onChainContractId)]);
      if (e.status === 4) await send(funder, 'resolveDispute', [BigInt(c.onChainContractId), 0]);
    } catch (err) {
      console.warn('cleanup failed for escrow', c.onChainContractId, (err as Error).message);
    }
  }
  await settle(1n);

  // Return leftover test USDC and ETH to the funder.
  for (const acct of [clientAcct, freelancerAcct, poorAcct]) {
    try {
      const bal = await usdc(acct.address);
      if (bal > 0n) {
        const h = await wallet(acct).writeContract({ address: cfg.usdcAddress, abi: USDC_ABI, functionName: 'transfer', args: [funder.address, bal], account: acct, chain: baseSepolia });
        await pub.waitForTransactionReceipt({ hash: h });
      }
      const eth = await pub.getBalance({ address: acct.address });
      const gasPrice = await pub.getGasPrice();
      const fee = gasPrice * 2n * 21_000n + 50_000_000_000_000n; // leave room for L1 data fee
      if (eth > fee) {
        const h = await wallet(acct).sendTransaction({ to: funder.address, value: eth - fee, account: acct, chain: baseSepolia, gas: 21_000n });
        await pub.waitForTransactionReceipt({ hash: h });
      }
    } catch (err) {
      console.warn('sweep failed for', acct.address, (err as Error).message);
    }
  }
});

describe('ForjEscrowV3 on Base Sepolia', () => {
  let normalId: string;
  let normalFundHash: Hex;

  it('NORMAL: fund → submit → approve settles on-chain and in the database', async () => {
    normalId = await newContract();
    const { hash, approve, receipt: fundReceipt } = await fund(normalId);
    const before = await usdc(freelancerAcct.address, fundReceipt.blockNumber);
    normalFundHash = hash;

    let c = await row(normalId);
    expect(c.status).toBe('in_progress');
    expect(c.onChainStatus).toBe('funded');
    expect(c.escrowVersion).toBe('v3');
    expect(c.onChainContractId).not.toBeNull();

    // Recording the same hash again is idempotent.
    const again = await record(client, normalId, 'fund', hash);
    expect(again.outcome).toBe('confirmed');

    // A real, successful transaction that did something else is rejected.
    const other = await newContract();
    await api(client.id).escrow.prepareFunding({ contractId: other });
    const wrong = await record(client, other, 'fund', approve);
    expect(wrong.outcome).toBe('failed');
    expect(wrong.transaction.failureReason).toMatch(/did not perform/);

    const escrowId = BigInt(c.onChainContractId!);
    const sub = await send(freelancerAcct, 'submitWork', [escrowId]);
    const s = await record(freelancer, normalId, 'submit_work', sub.hash, { message: 'Delivered the full scope as agreed.' });
    expect(s.outcome).toBe('confirmed');
    c = await row(normalId);
    expect(c.status).toBe('submitted');
    expect(c.onChainStatus).toBe('submitted');
    expect(c.submissionMessage).toBe('Delivered the full scope as agreed.');
    expect(c.reviewDeadlineAt).not.toBeNull();

    const rel = await send(clientAcct, 'release', [escrowId]);
    await settle(1n);
    expect((await record(client, normalId, 'release', rel.hash)).outcome).toBe('confirmed');
    c = await row(normalId);
    expect(c.status).toBe('completed');
    expect(c.onChainStatus).toBe('released');
    expect(c.settledToFreelancer).toBe('980000');
    expect(c.settledToFee).toBe('70000');
    expect((await usdc(freelancerAcct.address, rel.receipt.blockNumber)) - before).toBe(980_000n);
    const f = await db.query.users.findFirst({ where: eq(users.id, freelancer.id) });
    expect(Number(f!.totalEarned)).toBeCloseTo(0.98, 6);
    expect(f!.totalJobsCompleted).toBe(1);
  });

  it('REVISION: request → resubmit → approve', async () => {
    const id = await newContract();
    await fund(id);
    const escrowId = BigInt((await row(id)).onChainContractId!);
    await record(freelancer, id, 'submit_work', (await send(freelancerAcct, 'submitWork', [escrowId])).hash);
    const rev = await send(clientAcct, 'requestRevision', [escrowId]);
    expect((await record(client, id, 'request_revision', rev.hash, { reason: 'Please add the missing tests.' })).outcome).toBe('confirmed');
    let c = await row(id);
    expect(c.status).toBe('revision_requested');
    expect(c.onChainRevisionCount).toBe(1);
    expect(c.revisionReason).toBe('Please add the missing tests.');
    await record(freelancer, id, 'submit_work', (await send(freelancerAcct, 'submitWork', [escrowId])).hash);
    await record(client, id, 'release', (await send(clientAcct, 'release', [escrowId])).hash);
    c = await row(id);
    expect(c.status).toBe('completed');
    expect(c.onChainStatus).toBe('released');
  });

  it('DISPUTE: client disputes, arbiter splits 60/40 within the fee bound', async () => {
    const id = await newContract();
    await fund(id);
    const escrowId = BigInt((await row(id)).onChainContractId!);
    await record(freelancer, id, 'submit_work', (await send(freelancerAcct, 'submitWork', [escrowId])).hash);
    const d = await send(clientAcct, 'raiseDispute', [escrowId]);
    expect((await record(client, id, 'raise_dispute', d.hash, { reason: 'Delivery does not match the brief at all.' })).outcome).toBe('confirmed');
    let c = await row(id);
    expect(c.status).toBe('disputed');
    expect(c.onChainStatus).toBe('disputed');
    expect(c.disputeDeadlineAt).not.toBeNull();

    // Parties cannot record an arbiter action; only the admin router can.
    const res = await send(funder, 'resolveDispute', [escrowId, 6000]);
    const admin = await api(ADMIN_ID).admin.recordArbiterTransaction({
      contractId: id,
      txHash: res.hash,
      chainId: cfg.chainId,
      reason: 'Partial delivery verified against the brief; 60% awarded.',
    });
    expect(admin.outcome).toBe('confirmed');
    c = await row(id);
    expect(c.onChainStatus).toBe('resolved');
    expect(c.settledToFreelancer).toBe('588000');
    expect(c.settledToClient).toBe('420000');
    expect(c.settledToFee).toBe('42000');
  });

  it('FAILURES: wrong chain, unauthorized callers, reverted tx and safe retry', async () => {
    const id = await newContract();
    await fund(id);
    const escrowId = BigInt((await row(id)).onChainContractId!);

    await expect(api(client.id).escrow.recordTransaction({ contractId: id, action: 'release', txHash: normalFundHash, chainId: 8453 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(record(stranger, id, 'release', normalFundHash)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(record(freelancer, id, 'release', normalFundHash)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(record(client, id, 'submit_work', normalFundHash)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Client asks for a revision before any submission: the chain reverts it.
    const bad = await send(clientAcct, 'requestRevision', [escrowId], { gas: 120_000n });
    expect(bad.receipt.status).toBe('reverted');
    const failed = await record(client, id, 'request_revision', bad.hash, { reason: 'Premature revision request.' });
    expect(failed.outcome).toBe('failed');
    let c = await row(id);
    expect(c.onChainStatus).toBe('funded'); // nothing changed
    expect(c.revisionReason).toBeNull(); // metadata never copied from a failed tx

    // Retrying with a valid action works: the failed row doesn't block it.
    const ok = await send(freelancerAcct, 'submitWork', [escrowId]);
    expect((await record(freelancer, id, 'submit_work', ok.hash)).outcome).toBe('confirmed');

    // A transaction that never reaches the chain stays pending and blocks duplicates.
    const ghost = `0x${'ab'.repeat(32)}` as Hex;
    const pending = await record(client, id, 'release', ghost);
    expect(pending.outcome).toBe('pending');
    await expect(record(client, id, 'release', `0x${'cd'.repeat(32)}`)).rejects.toMatchObject({ code: 'CONFLICT' });
    // After 30 minutes the reconciler declares it dropped.
    await db.update(escrowTransactions).set({ createdAt: new Date(Date.now() - 31 * 60 * 1000) }).where(eq(escrowTransactions.txHash, ghost));
    const rep = await reconcileEscrows(cfg, { staleAfterMs: 0 });
    expect(rep.failed).toBeGreaterThanOrEqual(1);
    const ghostRow = await db.query.escrowTransactions.findFirst({ where: eq(escrowTransactions.txHash, ghost) });
    expect(ghostRow!.status).toBe('failed');
    c = await row(id);
    expect(c.status).toBe('submitted');

    // Insufficient balance: the pre-flight simulation stops the wallet flow.
    await expect(
      pub.simulateContract({
        address: cfg.escrowAddress,
        abi: forjEscrowV3Abi,
        functionName: 'fund',
        args: [`0x${'11'.repeat(32)}`, freelancerAcct.address, 1_000_000n, BigInt(Math.floor(Date.now() / 1000) + 86_400), 500, 200],
        account: poorAcct.address,
      }),
    ).rejects.toThrow();
  });

  it('RECONCILIATION: repairs a stale database from real chain events only', async () => {
    // (a) Client funds on-chain but the app never reports it.
    const id = await newContract();
    await fund(id, { record: false });
    expect((await row(id)).status).toBe('created');
    await settle();

    let rep = await reconcileEscrows(cfg, { staleAfterMs: 0 });
    expect(rep.recovered).toBeGreaterThanOrEqual(1);
    let c = await row(id);
    expect(c.status).toBe('in_progress');
    expect(c.onChainStatus).toBe('funded');

    // (b) Freelancer submits on-chain without telling Forj → DB is stale.
    const escrowId = BigInt(c.onChainContractId!);
    await send(freelancerAcct, 'submitWork', [escrowId]);
    expect((await row(id)).onChainStatus).toBe('funded');
    await settle();
    rep = await reconcileEscrows(cfg, { staleAfterMs: 0 });
    c = await row(id);
    expect(c.onChainStatus).toBe('submitted');
    expect(c.status).toBe('submitted');
    expect(c.syncIssue).toBeNull();

    // (c) A forged database state (claims completed while chain says submitted) is flagged, not trusted.
    await db.update(contracts).set({ status: 'completed', lastReconciledAt: null }).where(eq(contracts.id, id));
    rep = await reconcileEscrows(cfg, { staleAfterMs: 0 });
    expect(rep.mismatches.some((m) => m.contractId === id)).toBe(true);
    expect((await row(id)).syncIssue).toMatch(/submitted/);
    await db.update(contracts).set({ status: 'submitted' }).where(eq(contracts.id, id));

    // Finish so the escrow doesn't sit open.
    await record(client, id, 'release', (await send(clientAcct, 'release', [escrowId])).hash);
  });

  it('INDEXER: full replay of every log is idempotent (no duplicate events, no state or earnings change)', async () => {
    await settle(cfg.confirmations + 1n);
    // First pass may legitimately add events the receipt path never saw.
    await syncEscrowLogs(cfg, { chunkSize: 5_000n, maxChunks: 400 });
    const snapshot = async () => ({
      events: (await db.select().from(escrowEvents)).map((e) => `${e.txHash}:${e.logIndex}:${e.contractId}:${e.appliedAt != null}`).sort(),
      contracts: (await db.select().from(contracts)).map((c) => `${c.id}:${c.status}:${c.onChainStatus}:${c.settledToFreelancer}`).sort(),
      earned: (await db.query.users.findFirst({ where: eq(users.id, freelancer.id) }))!.totalEarned,
      completed: (await db.query.users.findFirst({ where: eq(users.id, freelancer.id) }))!.totalJobsCompleted,
    });
    const before = await snapshot();
    // Force a full replay from the deploy block, twice.
    for (let i = 0; i < 2; i++) {
      await db.delete(indexerCursors);
      await syncEscrowLogs(cfg, { chunkSize: 5_000n, maxChunks: 400 });
    }
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(before.events.every((e) => e.endsWith(':true'))).toBe(true);
    const pendingLeft = await db.query.escrowTransactions.findMany({ where: eq(escrowTransactions.status, 'pending') });
    expect(pendingLeft.length).toBe(0);
  });
});
