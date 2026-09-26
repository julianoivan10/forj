import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from './context';

/**
 * Authorization / input-validation tests for the tRPC API.
 *
 * Procedures run through the real router with a fake `ctx.db`, so these
 * cover the checks the routers make before touching storage or the chain:
 * who may call what, which payment paths exist, which chain is accepted
 * and which fields leave the server. They do not replace an end-to-end
 * run against a real database.
 */

vi.mock('./services/notifications', () => ({ notify: vi.fn(async () => undefined) }));
vi.mock('./services/escrow', async (importOriginal) => {
  const real = await importOriginal<typeof import('./services/escrow')>();
  return { ...real, verifyEscrowFunding: vi.fn(real.verifyEscrowFunding) };
});
vi.mock('./escrow-v3', async (importOriginal) => {
  const real = await importOriginal<typeof import('./escrow-v3')>();
  return {
    ...real,
    isEscrowV3Enabled: vi.fn(real.isEscrowV3Enabled),
    // No RPC in unit tests: a recorded transaction simply stays pending.
    confirmEscrowTransaction: vi.fn(async () => 'pending' as const),
  };
});

const { createCaller } = await import('./root');
const escrow = await import('./services/escrow');
const escrowV3 = await import('./escrow-v3');
const { isAllowedFileUrl } = await import('./lib/file-host');

const CLIENT = '00000000-0000-4000-8000-0000000000c1';
const FREELANCER = '00000000-0000-4000-8000-0000000000f1';
const STRANGER = '00000000-0000-4000-8000-000000000051';
const ADMIN = '00000000-0000-4000-8000-00000000ad01';
const CONTRACT_ID = '00000000-0000-4000-8000-00000000c0c0';
const TX = `0x${'ab'.repeat(32)}`;

function user(id: string) {
  return { id, displayName: 'Test', username: 'test' } as unknown as NonNullable<Context['user']>;
}

/** Minimal stand-in for the drizzle client: query builders + write chains. */
function makeDb() {
  const updateResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const chain = (result: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['set', 'where', 'values', 'onConflictDoNothing', 'orderBy', 'limit']) c[m] = () => c;
    c.returning = async () => result();
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej);
    return c;
  };
  const table = () => ({
    findFirst: vi.fn<(args?: unknown) => Promise<unknown>>(async () => undefined),
    findMany: vi.fn<(args?: unknown) => Promise<unknown[]>>(async () => []),
  });
  const db = {
    query: {
      contracts: table(),
      jobs: table(),
      proposals: table(),
      users: table(),
      reviews: table(),
      messages: table(),
      escrowTransactions: table(),
      escrowEvents: table(),
    },
    update: vi.fn(() => chain(() => updateResults.shift() ?? [])),
    insert: vi.fn(() => chain(() => insertResults.shift() ?? [])),
    select: vi.fn(() => chain(() => [])),
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    /** Queue the rows returned by the next `update(...).returning()`. */
    queueUpdate: (rows: unknown[]) => updateResults.push(rows),
    /** Queue the rows returned by the next `insert(...).returning()`. */
    queueInsert: (rows: unknown[]) => insertResults.push(rows),
  };
  return db;
}

type FakeDb = ReturnType<typeof makeDb>;

function caller(db: FakeDb, userId: string | null) {
  return createCaller({
    db: db as unknown as Context['db'],
    user: userId ? user(userId) : null,
    headers: new Headers(),
  });
}

function contractRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTRACT_ID,
    jobId: '00000000-0000-4000-8000-00000000j0b1'.replace('j0b1', '0b01'),
    clientId: CLIENT,
    freelancerId: FREELANCER,
    title: 'Test contract',
    status: 'created',
    paymentMethod: 'crypto',
    totalAmount: '1000.00',
    freelancerAmount: '980.00',
    onChainContractId: null,
    escrowVersion: 'v2',
    client: { id: CLIENT, walletAddress: `0x${'c1'.repeat(20)}` },
    freelancer: { id: FREELANCER, walletAddress: `0x${'f1'.repeat(20)}` },
    ...overrides,
  };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

let db: FakeDb;
beforeEach(() => {
  db = makeDb();
  vi.unstubAllEnvs();
});

describe('authentication gates', () => {
  it('protected procedures reject anonymous callers', async () => {
    await expectCode(caller(db, null).contract.myContracts(), 'UNAUTHORIZED');
    await expectCode(caller(db, null).notification.list({}), 'UNAUTHORIZED');
  });

  it('admin procedures reject non-admins and anonymous callers', async () => {
    await expectCode(caller(db, CLIENT).admin.listDisputed(), 'FORBIDDEN');
    await expectCode(caller(db, null).admin.listDisputed(), 'UNAUTHORIZED');
    await expectCode(
      caller(db, STRANGER).admin.relinkUser({
        targetUserId: CLIENT,
        newPrivyId: 'did:privy:attacker',
        reason: 'x'.repeat(30),
      }),
      'FORBIDDEN',
    );
  });

  it('admins pass the gate', async () => {
    db.query.contracts.findMany.mockResolvedValueOnce([]);
    await expect(caller(db, ADMIN).admin.listDisputed()).resolves.toBeDefined();
  });
});

describe('contract IDOR / BOLA', () => {
  it('a stranger cannot read, fund, approve, dispute or cancel someone else’s contract', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow({ status: 'submitted' }));
    const s = caller(db, STRANGER);
    await expectCode(s.contract.getById({ id: CONTRACT_ID }), 'FORBIDDEN');
    await expectCode(s.contract.raiseDispute({ contractId: CONTRACT_ID, reason: 'x'.repeat(30) }), 'FORBIDDEN');
    await expectCode(s.contract.cancelContract({ contractId: CONTRACT_ID, reason: 'x'.repeat(30) }), 'FORBIDDEN');
    await expectCode(
      s.contract.approveWork({ paymentMethod: 'crypto', contractId: CONTRACT_ID, txHash: TX, chainId: 84532 }),
      'FORBIDDEN',
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('the freelancer cannot fund or approve; the client cannot submit work', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow({ status: 'submitted' }));
    await expectCode(
      caller(db, FREELANCER).contract.approveWork({ paymentMethod: 'crypto', contractId: CONTRACT_ID, txHash: TX, chainId: 84532 }),
      'FORBIDDEN',
    );
    db.query.contracts.findFirst.mockResolvedValue(contractRow());
    await expectCode(
      caller(db, FREELANCER).contract.fundEscrow({
        paymentMethod: 'crypto', contractId: CONTRACT_ID, txHash: TX, onChainContractId: '1', chainId: 84532,
      }),
      'FORBIDDEN',
    );
    db.query.contracts.findFirst.mockResolvedValue(contractRow({ status: 'in_progress' }));
    await expectCode(
      caller(db, CLIENT).contract.submitWork({ contractId: CONTRACT_ID, message: 'done with the work' }),
      'FORBIDDEN',
    );
  });

  it('getById projects party columns (no email / privyId / preferences)', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow());
    await caller(db, CLIENT).contract.getById({ id: CONTRACT_ID });
    const args = db.query.contracts.findFirst.mock.calls[0]![0] as {
      with: Record<string, { columns?: Record<string, boolean> }>;
    };
    for (const party of ['client', 'freelancer']) {
      const cols = args.with[party]!.columns!;
      expect(cols).toBeDefined();
      expect(cols.email).toBeUndefined();
      expect(cols.privyId).toBeUndefined();
      expect(cols.notificationPreferences).toBeUndefined();
    }
  });
});

describe('payment path integrity (legacy v2 path, V3 not deployed)', () => {
  beforeEach(() => {
    vi.mocked(escrowV3.isEscrowV3Enabled).mockReturnValue(false);
  });

  it('rejects the unverified "fiat" funding path', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow());
    await expectCode(
      caller(db, CLIENT).contract.fundEscrow({ paymentMethod: 'fiat', contractId: CONTRACT_ID }),
      'BAD_REQUEST',
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects crypto funding for a contract stored as fiat', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow({ paymentMethod: 'fiat' }));
    await expectCode(
      caller(db, CLIENT).contract.fundEscrow({
        paymentMethod: 'crypto', contractId: CONTRACT_ID, txHash: TX, onChainContractId: '1', chainId: 84532,
      }),
      'BAD_REQUEST',
    );
  });

  it('rejects "fiat" approval, which would fake completion and reputation', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow({ status: 'submitted', onChainContractId: 1 }));
    await expectCode(
      caller(db, CLIENT).contract.approveWork({ paymentMethod: 'fiat', contractId: CONTRACT_ID }),
      'BAD_REQUEST',
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects a funding tx from a chain other than the configured one', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow());
    const p = caller(db, CLIENT).contract.fundEscrow({
      paymentMethod: 'crypto', contractId: CONTRACT_ID, txHash: TX, onChainContractId: '1', chainId: 8453,
    });
    await expect(p).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('settles on chain 84532') });
  });

  it('fails closed when the server chain is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAIN_ID', '');
    expect(() => escrow.getConfiguredChainId()).toThrow(/not configured/);
    vi.stubEnv('NEXT_PUBLIC_CHAIN_ID', '1');
    expect(() => escrow.getConfiguredChainId()).toThrow(/not configured/);
  });

  describe('with a verified funding tx', () => {
    beforeEach(() => {
      vi.mocked(escrow.verifyEscrowFunding).mockResolvedValueOnce({
        escrowId: 7n,
        client: `0x${'c1'.repeat(20)}`,
        freelancer: `0x${'f1'.repeat(20)}`,
        amount: 1_000_000_000n,
        clientFee: 50_000_000n,
        freelancerFeeBps: 200,
        deliveryDeadline: 0n,
        blockNumber: 1n,
      });
    });
    const fund = () =>
      caller(db, CLIENT).contract.fundEscrow({
        paymentMethod: 'crypto', contractId: CONTRACT_ID, txHash: TX, onChainContractId: '7', chainId: 84532,
      });

    it('refuses to link one on-chain escrow to a second contract (replay)', async () => {
      db.query.contracts.findFirst
        .mockResolvedValueOnce(contractRow())
        .mockResolvedValueOnce({ id: '00000000-0000-4000-8000-00000000dead' });
      await expectCode(fund(), 'CONFLICT');
      expect(db.update).not.toHaveBeenCalled();
    });

    it('a concurrent second funding attempt loses the conditional update', async () => {
      db.query.contracts.findFirst.mockResolvedValueOnce(contractRow()).mockResolvedValueOnce(undefined);
      db.queueUpdate([]); // WHERE status = 'created' matched nothing
      await expectCode(fund(), 'CONFLICT');
    });

    it('succeeds once for the rightful client', async () => {
      db.query.contracts.findFirst.mockResolvedValueOnce(contractRow()).mockResolvedValueOnce(undefined);
      db.queueUpdate([{ ...contractRow(), status: 'in_progress' }]);
      await expect(fund()).resolves.toMatchObject({ status: 'in_progress' });
    });
  });
});

describe('input validation', () => {
  it('submission attachments must be hosted uploads', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow({ status: 'in_progress' }));
    const f = caller(db, FREELANCER);
    for (const url of ['https://evil.example/malware.zip', 'javascript:alert(1)', 'http://utfs.io/f/x']) {
      await expectCode(
        f.contract.submitWork({ contractId: CONTRACT_ID, message: 'here is the work', files: [url] }),
        'BAD_REQUEST',
      );
    }
    expect(db.update).not.toHaveBeenCalled();
  });

  it('file host allowlist accepts UploadThing/Pinata only', () => {
    expect(isAllowedFileUrl('https://utfs.io/f/abc')).toBe(true);
    expect(isAllowedFileUrl('https://a1b2c3.ufs.sh/f/abc')).toBe(true);
    expect(isAllowedFileUrl('https://gateway.pinata.cloud/ipfs/Qm')).toBe(true);
    expect(isAllowedFileUrl('https://evil.ufs.sh.attacker.io/f/abc')).toBe(false);
    expect(isAllowedFileUrl('https://a.b.ufs.sh/f/abc')).toBe(false);
    expect(isAllowedFileUrl('https://ufs.sh/f/abc')).toBe(false);
    expect(isAllowedFileUrl('http://abc.ufs.sh/f/abc')).toBe(false);
    expect(isAllowedFileUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('public job endpoints', () => {
  const job = (visibility: string) => ({
    id: '00000000-0000-4000-8000-000000000b01',
    clientId: CLIENT,
    visibility,
    client: { id: CLIENT },
  });

  it('never join private user columns', async () => {
    db.query.jobs.findFirst.mockResolvedValue(job('public'));
    await caller(db, null).job.getBySlug({ slug: 'some-job' });
    const args = db.query.jobs.findFirst.mock.calls[0]![0] as {
      with: { client: { columns?: Record<string, boolean> } };
    };
    expect(args.with.client.columns).toBeDefined();
    expect(args.with.client.columns!.email).toBeUndefined();
    expect(args.with.client.columns!.privyId).toBeUndefined();
    expect(args.with.client.columns!.walletAddress).toBeUndefined();
  });

  it('hide private service orders from everyone but the two parties', async () => {
    db.query.jobs.findFirst.mockResolvedValue(job('private'));
    await expectCode(caller(db, null).job.getBySlug({ slug: 'order' }), 'NOT_FOUND');
    await expectCode(caller(db, STRANGER).job.getById({ id: job('private').id }), 'NOT_FOUND');
    await expect(caller(db, CLIENT).job.getBySlug({ slug: 'order' })).resolves.toBeDefined();
    db.query.proposals.findFirst.mockResolvedValueOnce({ id: 'p1' });
    await expect(caller(db, FREELANCER).job.getBySlug({ slug: 'order' })).resolves.toBeDefined();
  });
});

describe('proposals and messages', () => {
  it('only the applicant or the job owner can read a proposal', async () => {
    db.query.proposals.findFirst.mockResolvedValue({
      id: 'p1',
      freelancerId: FREELANCER,
      job: { clientId: CLIENT },
      freelancer: { id: FREELANCER },
    });
    await expectCode(caller(db, STRANGER).proposal.getById({ id: '00000000-0000-4000-8000-000000000001' }), 'FORBIDDEN');
    await expect(caller(db, CLIENT).proposal.getById({ id: '00000000-0000-4000-8000-000000000001' })).resolves.toBeDefined();
  });

  it('a user cannot read a conversation they are not part of', async () => {
    await expectCode(
      caller(db, STRANGER).message.getMessages({ conversationId: `${CLIENT}:${FREELANCER}` }),
      'FORBIDDEN',
    );
  });
});

// ───────────────────────────────────────────────────────────── Escrow V3
const V3_ESCROW = '0x9813a755cd6daa83a9b32dd7222594208365c43b';
const TX2 = `0x${'cd'.repeat(32)}`;

function v3Row(overrides: Record<string, unknown> = {}) {
  return contractRow({
    escrowVersion: 'v3',
    escrowContractAddress: V3_ESCROW,
    contractRef: `0x${'ee'.repeat(32)}`,
    onChainContractId: 7,
    onChainStatus: 'funded',
    status: 'in_progress',
    ...overrides,
  });
}

describe('escrow V3: legacy database-only transitions are refused', () => {
  beforeEach(() => {
    vi.mocked(escrowV3.isEscrowV3Enabled).mockReturnValue(true);
  });

  it('v2 funding is refused once V3 is deployed', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow());
    await expect(
      caller(db, CLIENT).contract.fundEscrow({ paymentMethod: 'crypto', contractId: CONTRACT_ID, txHash: TX, onChainContractId: '1', chainId: 84532 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('ForjEscrowV3') });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('submit / revise / dispute / approve / claim cannot move a V3 contract without the chain', async () => {
    const c = caller(db, CLIENT);
    const f = caller(db, FREELANCER);
    db.query.contracts.findFirst.mockResolvedValue(v3Row({ status: 'in_progress' }));
    await expectCode(f.contract.submitWork({ contractId: CONTRACT_ID, message: 'done with the work' }), 'BAD_REQUEST');
    await expectCode(c.contract.raiseDispute({ contractId: CONTRACT_ID, reason: 'x'.repeat(30) }), 'BAD_REQUEST');
    db.query.contracts.findFirst.mockResolvedValue(v3Row({ status: 'submitted', onChainStatus: 'submitted' }));
    await expectCode(c.contract.requestRevision({ contractId: CONTRACT_ID, reason: 'please change it' }), 'BAD_REQUEST');
    await expectCode(c.contract.approveWork({ paymentMethod: 'crypto', contractId: CONTRACT_ID, txHash: TX, chainId: 84532 }), 'BAD_REQUEST');
    await expectCode(f.contract.claimRelease({ contractId: CONTRACT_ID, txHash: TX, chainId: 84532 }), 'BAD_REQUEST');
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('escrow V3: recordTransaction', () => {
  const rec = (userId: string, action: string, overrides: Record<string, unknown> = {}) =>
    caller(db, userId).escrow.recordTransaction({
      contractId: CONTRACT_ID,
      action: action as never,
      txHash: TX,
      chainId: 84532,
      ...overrides,
    });

  it('rejects transactions from another chain', async () => {
    db.query.contracts.findFirst.mockResolvedValue(v3Row());
    await expect(rec(CLIENT, 'release', { chainId: 8453 })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('84532') });
  });

  it('enforces the party × action matrix', async () => {
    db.query.contracts.findFirst.mockResolvedValue(v3Row());
    await expectCode(rec(STRANGER, 'release'), 'FORBIDDEN');
    for (const action of ['fund', 'release', 'request_revision', 'refund_after_deadline']) {
      await expectCode(rec(FREELANCER, action), 'FORBIDDEN');
    }
    for (const action of ['submit_work', 'cancel_by_freelancer']) {
      await expectCode(rec(CLIENT, action), 'FORBIDDEN');
    }
    // Arbiter resolutions only exist on the admin router.
    await expect(rec(CLIENT, 'resolve_dispute')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('refuses legacy contracts, unfunded escrows and settled escrows', async () => {
    db.query.contracts.findFirst.mockResolvedValueOnce(v3Row({ escrowVersion: 'v2' }));
    await expectCode(rec(CLIENT, 'release'), 'BAD_REQUEST');
    db.query.contracts.findFirst.mockResolvedValueOnce(v3Row({ onChainContractId: null }));
    await expectCode(rec(CLIENT, 'release'), 'BAD_REQUEST');
    for (const terminal of ['released', 'refunded', 'resolved']) {
      db.query.contracts.findFirst.mockResolvedValueOnce(v3Row({ onChainStatus: terminal }));
      await expectCode(rec(CLIENT, 'release'), 'BAD_REQUEST');
    }
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('records a valid action as pending — it is never confirmed on the caller’s word', async () => {
    db.query.contracts.findFirst.mockResolvedValue(v3Row({ status: 'submitted', onChainStatus: 'submitted' }));
    const pendingRow = { id: 'tx1', contractId: CONTRACT_ID, action: 'release', status: 'pending', txHash: TX };
    db.queueInsert([pendingRow]);
    db.query.escrowTransactions.findFirst.mockResolvedValueOnce(undefined).mockResolvedValueOnce(pendingRow);
    const res = await rec(CLIENT, 'release');
    expect(res.outcome).toBe('pending');
    expect(db.update).not.toHaveBeenCalled(); // contract row untouched until the chain confirms
  });

  it('a repeated hash for the same action is idempotent; for another action it is refused', async () => {
    db.query.contracts.findFirst.mockResolvedValue(v3Row({ status: 'completed', onChainStatus: 'released' }));
    const existing = { id: 'tx1', contractId: CONTRACT_ID, action: 'release', status: 'confirmed', txHash: TX };
    db.query.escrowTransactions.findFirst.mockResolvedValue(existing);
    await expect(rec(CLIENT, 'release')).resolves.toMatchObject({ outcome: 'confirmed' });
    await expectCode(rec(CLIENT, 'raise_dispute', { txHash: TX }), 'CONFLICT');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('metadata attachments must be hosted uploads', async () => {
    db.query.contracts.findFirst.mockResolvedValue(v3Row());
    await expectCode(rec(FREELANCER, 'submit_work', { txHash: TX2, metadata: { message: 'here is the work', files: ['https://evil.example/x.zip'] } }), 'BAD_REQUEST');
  });
});

describe('escrow V3: prepareFunding', () => {
  it('only the client of a still-unfunded crypto contract gets terms, computed server-side', async () => {
    db.query.contracts.findFirst.mockResolvedValue(contractRow({ deliveryDeadline: new Date(Date.now() + 10 * 86_400_000) }));
    await expectCode(caller(db, FREELANCER).escrow.prepareFunding({ contractId: CONTRACT_ID }), 'FORBIDDEN');
    await expectCode(caller(db, STRANGER).escrow.prepareFunding({ contractId: CONTRACT_ID }), 'FORBIDDEN');
    const t = await caller(db, CLIENT).escrow.prepareFunding({ contractId: CONTRACT_ID });
    expect(t.amount).toBe('1000000000'); // from the stored contract, 1,000.00 USDC
    expect(t.clientFee).toBe('50000000');
    expect(t.chainId).toBe(84532);
    expect(t.escrowAddress.toLowerCase()).toBe(V3_ESCROW);
    expect(t.contractRef).toMatch(/^0x[0-9a-f]{64}$/);
    expect(t.maxClientFeeBps).toBe(500);
    expect(t.maxFreelancerFeeBps).toBe(200);
  });

  it('refuses funded contracts and deadlines that already passed', async () => {
    db.query.contracts.findFirst.mockResolvedValueOnce(contractRow({ status: 'in_progress' }));
    await expectCode(caller(db, CLIENT).escrow.prepareFunding({ contractId: CONTRACT_ID }), 'BAD_REQUEST');
    db.query.contracts.findFirst.mockResolvedValueOnce(contractRow({ deliveryDeadline: new Date(Date.now() - 1000) }));
    await expectCode(caller(db, CLIENT).escrow.prepareFunding({ contractId: CONTRACT_ID }), 'BAD_REQUEST');
  });
});

describe('public work record', () => {
  it('lists only completed contracts and never private columns', async () => {
    db.query.users.findFirst.mockResolvedValue({ id: FREELANCER });
    db.query.contracts.findMany.mockResolvedValue([]);
    await caller(db, null).user.workRecord({ username: 'kofi' });
    const args = db.query.contracts.findMany.mock.calls[0]![0] as {
      columns: Record<string, boolean>;
      with: Record<string, { columns: Record<string, boolean> }>;
    };
    for (const secret of ['email', 'privyId', 'walletAddress', 'notificationPreferences']) {
      expect(args.with.client!.columns[secret]).toBeUndefined();
      expect(args.with.freelancer!.columns[secret]).toBeUndefined();
    }
    for (const privateField of ['submissionMessage', 'submissionFiles', 'disputeReason', 'revisionReason', 'milestones']) {
      expect(args.columns[privateField]).toBeUndefined();
    }
  });

  it('404s for unknown or deleted users', async () => {
    db.query.users.findFirst.mockResolvedValue(undefined);
    await expectCode(caller(db, null).user.workRecord({ username: 'ghost' }), 'NOT_FOUND');
  });
});
