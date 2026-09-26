import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, maxUint128, parseUnits } from 'viem';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';

/**
 * ForjEscrow (v2, split fee) — the contract the app actually uses on
 * Base Sepolia (0x09fb…8954).
 *
 * Structure:
 *   - lifecycle + exact accounting for every settlement path
 *   - a full state × action transition matrix (Phase 6 of the audit)
 *   - access control for every privileged / party-only function
 *   - adversarial tokens: re-entrancy, blocklist, fee-on-transfer
 *   - a seeded random walk asserting the solvency invariant
 *   - `KNOWN RISK` tests. These PASS today because they pin down current,
 *     unsafe behaviour. They are expected to FAIL (and be rewritten) once
 *     the next escrow version fixes the underlying design issue. A passing
 *     suite is therefore NOT a statement that the contract is safe.
 */

const USDC = (v: string) => parseUnits(v, 6);
const ONE_DAY = 24n * 60n * 60n;
const REVIEW_WINDOW = 7n * ONE_DAY;
const CLIENT_BPS = 500n;
const FREELANCER_BPS = 200n;

enum Status {
  None = 0,
  Funded = 1,
  Submitted = 2,
  Released = 3,
  Refunded = 4,
  Disputed = 5,
  Resolved = 6,
}

async function expectRevert(p: Promise<unknown>, reason?: string) {
  try {
    await p;
  } catch (err) {
    if (reason) expect((err as Error).message).to.include(reason);
    return;
  }
  expect.fail(`expected revert${reason ? ` (${reason})` : ''}`);
}

async function deployWithToken(tokenName: string) {
  const [owner, client, freelancer, feeRecipient, stranger] = await hre.viem.getWalletClients();
  const token = await hre.viem.deployContract(tokenName as 'MockUSDC', []);
  const escrow = await hre.viem.deployContract('ForjEscrow', [
    token.address,
    feeRecipient.account.address,
    Number(CLIENT_BPS),
    Number(FREELANCER_BPS),
    REVIEW_WINDOW,
    owner.account.address,
  ]);
  const float = USDC('1000000');
  await token.write.mint([client.account.address, float]);
  await token.write.approve([escrow.address, float], { account: client.account });
  return { owner, client, freelancer, feeRecipient, stranger, token, escrow, float };
}

const deployFixture = () => deployWithToken('MockUSDC');
type Ctx = Awaited<ReturnType<typeof deployFixture>>;

async function fundOne(ctx: Ctx, amount = USDC('1000')) {
  const deadline = BigInt(await time.latest()) + 30n * ONE_DAY;
  const id = await ctx.escrow.read.nextEscrowId();
  await ctx.escrow.write.fund([ctx.freelancer.account.address, amount, deadline], {
    account: ctx.client.account,
  });
  return { id, amount, clientFee: (amount * CLIENT_BPS) / 10_000n };
}

const bal = (ctx: Ctx, who: `0x${string}`) => ctx.token.read.balanceOf([who]);
const status = async (ctx: Ctx, id: bigint) => (await ctx.escrow.read.getEscrow([id])).status;

describe('ForjEscrow', () => {
  describe('deployment', () => {
    it('stores constructor parameters', async () => {
      const ctx = await loadFixture(deployFixture);
      expect(getAddress(await ctx.escrow.read.usdc())).to.equal(getAddress(ctx.token.address));
      expect(await ctx.escrow.read.defaultClientFeeBps()).to.equal(Number(CLIENT_BPS));
      expect(await ctx.escrow.read.defaultFreelancerFeeBps()).to.equal(Number(FREELANCER_BPS));
      expect(await ctx.escrow.read.autoReleaseWindow()).to.equal(REVIEW_WINDOW);
      expect(await ctx.escrow.read.nextEscrowId()).to.equal(1n);
    });

    it('rejects zero addresses, fees above 10% and out-of-range windows', async () => {
      const [owner, , , fee] = await hre.viem.getWalletClients();
      const token = await hre.viem.deployContract('MockUSDC', []);
      const zero = '0x0000000000000000000000000000000000000000';
      const base = [token.address, fee.account.address, 500, 200, REVIEW_WINDOW, owner.account.address] as const;
      const bad: Array<readonly unknown[]> = [
        [zero, ...base.slice(1)],
        [base[0], zero, ...base.slice(2)],
        [...base.slice(0, 5), zero],
        [base[0], base[1], 1001, 200, REVIEW_WINDOW, base[5]],
        [base[0], base[1], 500, 1001, REVIEW_WINDOW, base[5]],
        [base[0], base[1], 500, 200, ONE_DAY - 1n, base[5]],
        [base[0], base[1], 500, 200, 30n * ONE_DAY + 1n, base[5]],
      ];
      for (const args of bad) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await expectRevert(hre.viem.deployContract('ForjEscrow', args as any));
      }
    });
  });

  describe('fund', () => {
    it('pulls amount + client fee and snapshots both fees', async () => {
      const ctx = await loadFixture(deployFixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id, amount, clientFee } = await fundOne(ctx);
      expect(clientFee).to.equal(USDC('50'));
      expect(before - (await bal(ctx, ctx.client.account.address))).to.equal(amount + clientFee);
      expect(await bal(ctx, ctx.escrow.address)).to.equal(amount + clientFee);
      const e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(Status.Funded);
      expect(e.amount).to.equal(amount);
      expect(e.clientFee).to.equal(clientFee);
      expect(e.freelancerFeeBps).to.equal(Number(FREELANCER_BPS));
    });

    it('quoteFund matches what fund() pulls', async () => {
      const ctx = await loadFixture(deployFixture);
      const [totalIn, clientFee] = await ctx.escrow.read.quoteFund([USDC('1234.56')]);
      expect(clientFee).to.equal((USDC('1234.56') * CLIENT_BPS) / 10_000n);
      expect(totalIn).to.equal(USDC('1234.56') + clientFee);
    });

    it('quoteFund does not overflow at the uint128 maximum', async () => {
      const ctx = await loadFixture(deployFixture);
      const [totalIn] = await ctx.escrow.read.quoteFund([maxUint128]);
      expect(totalIn > maxUint128).to.equal(true);
    });

    it('rounds fees down, so dust amounts carry no fee', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, clientFee } = await fundOne(ctx, 19n); // 19 base units
      expect(clientFee).to.equal(0n);
      await ctx.escrow.write.release([id], { account: ctx.client.account });
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(19n);
    });

    it('later fee changes do not affect an already funded escrow', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount } = await fundOne(ctx);
      await ctx.escrow.write.setDefaultFees([1000, 1000]);
      await ctx.escrow.write.release([id], { account: ctx.client.account });
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(amount - (amount * FREELANCER_BPS) / 10_000n);
    });

    it('rejects self-funding, zero freelancer, zero amount, past deadline, pause and missing allowance', async () => {
      const ctx = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const f = ctx.freelancer.account.address;
      const as = { account: ctx.client.account };
      await expectRevert(ctx.escrow.write.fund([ctx.client.account.address, USDC('1'), now + ONE_DAY], as), 'InvalidAddress');
      await expectRevert(ctx.escrow.write.fund(['0x0000000000000000000000000000000000000000', USDC('1'), now + ONE_DAY], as), 'InvalidAddress');
      await expectRevert(ctx.escrow.write.fund([f, 0n, now + ONE_DAY], as), 'InvalidAmount');
      await expectRevert(ctx.escrow.write.fund([f, USDC('1'), now], as), 'InvalidDeadline');
      await expectRevert(ctx.escrow.write.fund([f, USDC('1'), now + ONE_DAY], { account: ctx.stranger.account }));
      await ctx.escrow.write.pause();
      await expectRevert(ctx.escrow.write.fund([f, USDC('1'), now + ONE_DAY], as), 'EnforcedPause');
    });
  });

  describe('settlement accounting (1,000 USDC job)', () => {
    it('release: freelancer 980, platform 70, escrow empty', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], { account: ctx.freelancer.account });
      await ctx.escrow.write.release([id], { account: ctx.client.account });
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('980'));
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(USDC('70'));
      expect(await bal(ctx, ctx.escrow.address)).to.equal(0n);
      expect(await status(ctx, id)).to.equal(Status.Released);
    });

    it('claimAfterTimeout: anyone can trigger the same payout once the window passes', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], { account: ctx.freelancer.account });
      await expectRevert(ctx.escrow.write.claimAfterTimeout([id], { account: ctx.stranger.account }), 'TooEarly');
      await time.increase(REVIEW_WINDOW);
      await ctx.escrow.write.claimAfterTimeout([id], { account: ctx.stranger.account });
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('980'));
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(USDC('70'));
    });

    it('refund returns the full 1,050 deposit, no fee retained', async () => {
      const ctx = await loadFixture(deployFixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.refund([id], { account: ctx.freelancer.account });
      expect(await bal(ctx, ctx.client.account.address)).to.equal(before);
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(0n);
      expect(await status(ctx, id)).to.equal(Status.Refunded);
    });

    it('resolveDispute must distribute exactly amount + clientFee', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.raiseDispute([id], { account: ctx.freelancer.account });
      await expectRevert(ctx.escrow.write.resolveDispute([id, USDC('600'), USDC('400'), 0n]), 'SplitMismatch');
      await expectRevert(ctx.escrow.write.resolveDispute([id, USDC('600'), USDC('400'), USDC('51')]), 'SplitMismatch');
      await ctx.escrow.write.resolveDispute([id, USDC('600'), USDC('400'), USDC('50')]);
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('600'));
      expect(await bal(ctx, ctx.escrow.address)).to.equal(0n);
      expect(await status(ctx, id)).to.equal(Status.Resolved);
    });
  });

  describe('state transition matrix', () => {
    type Action = 'submit' | 'revise' | 'release' | 'claim' | 'refundClient' | 'refundFreelancer' | 'dispute' | 'resolve';
    const ACTIONS: Action[] = ['submit', 'revise', 'release', 'claim', 'refundClient', 'refundFreelancer', 'dispute', 'resolve'];

    // Expected outcome with the *correct* caller for every (state, action).
    const ALLOWED: Record<string, Action[]> = {
      Funded: ['submit', 'release', 'refundClient', 'refundFreelancer', 'dispute'],
      Submitted: ['revise', 'release', 'claim', 'dispute'],
      Released: [],
      Refunded: [],
      Disputed: ['resolve'],
      Resolved: [],
    };

    async function reach(ctx: Ctx, state: string) {
      const { id, amount, clientFee } = await fundOne(ctx);
      const c = { account: ctx.client.account };
      if (state === 'Submitted') await ctx.escrow.write.submitWork([id], { account: ctx.freelancer.account });
      if (state === 'Released') await ctx.escrow.write.release([id], c);
      if (state === 'Refunded') await ctx.escrow.write.refund([id], c);
      if (state === 'Disputed' || state === 'Resolved') await ctx.escrow.write.raiseDispute([id], c);
      if (state === 'Resolved') await ctx.escrow.write.resolveDispute([id, amount + clientFee, 0n, 0n]);
      return { id, total: amount + clientFee };
    }

    function run(ctx: Ctx, action: Action, id: bigint, total: bigint) {
      const c = { account: ctx.client.account };
      const f = { account: ctx.freelancer.account };
      switch (action) {
        case 'submit': return ctx.escrow.write.submitWork([id], f);
        case 'revise': return ctx.escrow.write.requestRevision([id], c);
        case 'release': return ctx.escrow.write.release([id], c);
        case 'claim': return ctx.escrow.write.claimAfterTimeout([id], { account: ctx.stranger.account });
        case 'refundClient': return ctx.escrow.write.refund([id], c);
        case 'refundFreelancer': return ctx.escrow.write.refund([id], f);
        case 'dispute': return ctx.escrow.write.raiseDispute([id], c);
        case 'resolve': return ctx.escrow.write.resolveDispute([id, total, 0n, 0n]);
      }
    }

    for (const [state, allowed] of Object.entries(ALLOWED)) {
      for (const action of ACTIONS) {
        const ok = allowed.includes(action);
        it(`${state} → ${action}: ${ok ? 'allowed' : 'reverts'}`, async () => {
          const ctx = await loadFixture(deployFixture);
          const { id, total } = await reach(ctx, state);
          await time.increase(REVIEW_WINDOW + 1n); // so `claim` is only gated by state
          const escrowBefore = await bal(ctx, ctx.escrow.address);
          if (ok) {
            await run(ctx, action, id, total);
          } else {
            await expectRevert(run(ctx, action, id, total));
            expect(await bal(ctx, ctx.escrow.address)).to.equal(escrowBefore);
          }
        });
      }
    }

    it('unknown escrow ids revert for every action', async () => {
      const ctx = await loadFixture(deployFixture);
      for (const action of ACTIONS) await expectRevert(run(ctx, action, 999n, 1n));
    });
  });

  describe('access control', () => {
    it('only the freelancer submits; only the client revises or releases', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      await expectRevert(ctx.escrow.write.submitWork([id], { account: ctx.client.account }), 'NotFreelancer');
      await expectRevert(ctx.escrow.write.submitWork([id], { account: ctx.stranger.account }), 'NotFreelancer');
      await expectRevert(ctx.escrow.write.release([id], { account: ctx.freelancer.account }), 'NotClient');
      await expectRevert(ctx.escrow.write.release([id], { account: ctx.stranger.account }), 'NotClient');
      await ctx.escrow.write.submitWork([id], { account: ctx.freelancer.account });
      await expectRevert(ctx.escrow.write.requestRevision([id], { account: ctx.freelancer.account }), 'NotClient');
    });

    it('strangers cannot refund or dispute', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      await expectRevert(ctx.escrow.write.refund([id], { account: ctx.stranger.account }), 'NotParty');
      await expectRevert(ctx.escrow.write.raiseDispute([id], { account: ctx.stranger.account }), 'NotParty');
    });

    it('every admin function is owner-only', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount, clientFee } = await fundOne(ctx);
      await ctx.escrow.write.raiseDispute([id], { account: ctx.client.account });
      const s = { account: ctx.stranger.account };
      await expectRevert(ctx.escrow.write.resolveDispute([id, amount + clientFee, 0n, 0n], s), 'OwnableUnauthorizedAccount');
      await expectRevert(ctx.escrow.write.setFeeRecipient([ctx.stranger.account.address], s), 'OwnableUnauthorizedAccount');
      await expectRevert(ctx.escrow.write.setDefaultFees([0, 0], s), 'OwnableUnauthorizedAccount');
      await expectRevert(ctx.escrow.write.setAutoReleaseWindow([ONE_DAY], s), 'OwnableUnauthorizedAccount');
      await expectRevert(ctx.escrow.write.pause(s), 'OwnableUnauthorizedAccount');
      await expectRevert(ctx.escrow.write.unpause(s), 'OwnableUnauthorizedAccount');
      await expectRevert(ctx.escrow.write.rescueToken([ctx.token.address, ctx.stranger.account.address, 1n], s), 'OwnableUnauthorizedAccount');
    });

    it('owner cannot sweep escrowed USDC through rescueToken', async () => {
      const ctx = await loadFixture(deployFixture);
      await fundOne(ctx);
      await expectRevert(ctx.escrow.write.rescueToken([ctx.token.address, ctx.owner.account.address, 1n]), 'CannotRescueUSDC');
    });

    it('pause blocks new funding but never blocks settlement', async () => {
      const ctx = await loadFixture(deployFixture);
      const a = await fundOne(ctx);
      const b = await fundOne(ctx);
      await ctx.escrow.write.pause();
      await ctx.escrow.write.release([a.id], { account: ctx.client.account });
      await ctx.escrow.write.refund([b.id], { account: ctx.client.account });
    });

    it('ownership transfer is two-step', async () => {
      const ctx = await loadFixture(deployFixture);
      await ctx.escrow.write.transferOwnership([ctx.stranger.account.address]);
      await expectRevert(ctx.escrow.write.pause({ account: ctx.stranger.account }));
      await ctx.escrow.write.acceptOwnership({ account: ctx.stranger.account });
      await ctx.escrow.write.pause({ account: ctx.stranger.account });
      await expectRevert(ctx.escrow.write.unpause(), 'OwnableUnauthorizedAccount');
    });
  });

  describe('adversarial tokens', () => {
    it('re-entrancy from the token during release is blocked', async () => {
      const ctx = await deployWithToken('MockReentrantToken');
      const token = await hre.viem.getContractAt('MockReentrantToken', ctx.token.address);
      const deadline = BigInt(await time.latest()) + ONE_DAY;
      await ctx.escrow.write.fund([ctx.freelancer.account.address, USDC('100'), deadline], { account: ctx.client.account });
      await ctx.escrow.write.fund([ctx.freelancer.account.address, USDC('100'), deadline], { account: ctx.client.account });
      // During release of #1 the token tries to refund #2 (and release #1 again).
      for (const data of [
        encodeFunctionData({ abi: ctx.escrow.abi, functionName: 'refund', args: [2n] }),
        encodeFunctionData({ abi: ctx.escrow.abi, functionName: 'release', args: [1n] }),
      ]) {
        await token.write.arm([ctx.escrow.address, data]);
        const id = (await ctx.escrow.read.getEscrow([1n])).status === Status.Funded ? 1n : 2n;
        await ctx.escrow.write.release([id], { account: ctx.client.account });
        expect(await token.read.attackAttempted()).to.equal(true);
        expect(await token.read.attackSucceeded()).to.equal(false);
      }
      expect(await ctx.token.read.balanceOf([ctx.escrow.address])).to.equal(0n);
    });

    it('a blocklisted freelancer blocks release; dispute routes funds back to the client', async () => {
      const ctx = await deployWithToken('MockBlocklistToken');
      const token = await hre.viem.getContractAt('MockBlocklistToken', ctx.token.address);
      const { id, amount, clientFee } = await fundOne(ctx as Ctx);
      await token.write.setBlocked([ctx.freelancer.account.address, true]);
      await expectRevert(ctx.escrow.write.release([id], { account: ctx.client.account }));
      await ctx.escrow.write.raiseDispute([id], { account: ctx.client.account });
      await ctx.escrow.write.resolveDispute([id, 0n, amount + clientFee, 0n]);
      expect(await ctx.token.read.balanceOf([ctx.escrow.address])).to.equal(0n);
    });

    it('KNOWN RISK: a fee-on-transfer token would make the escrow insolvent', async () => {
      // Deployments are pinned to Circle USDC, which is not deflationary.
      // This documents why that pin must never be relaxed.
      const ctx = await deployWithToken('MockFeeOnTransferToken');
      const a = await fundOne(ctx as Ctx);
      await fundOne(ctx as Ctx);
      const held = await ctx.token.read.balanceOf([ctx.escrow.address]);
      expect(held < 2n * (a.amount + a.clientFee)).to.equal(true);
      await ctx.escrow.write.refund([a.id], { account: ctx.client.account });
      await expectRevert(ctx.escrow.write.refund([2n], { account: ctx.client.account }));
    });
  });

  describe('solvency invariant (seeded random walk)', () => {
    it('escrow balance always equals the sum of open escrows, and each escrow settles once', async () => {
      const ctx = await loadFixture(deployFixture);
      let seed = 0x5eed;
      const rand = (n: number) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % n;
      };
      const settled = new Set<bigint>();
      for (let step = 0; step < 120; step++) {
        const next = await ctx.escrow.read.nextEscrowId();
        const id = next > 1n ? BigInt(1 + rand(Number(next - 1n))) : 1n;
        const c = { account: ctx.client.account };
        const f = { account: ctx.freelancer.account };
        const op = rand(9);
        try {
          if (op === 0 || next === 1n) await fundOne(ctx, BigInt(1 + rand(5_000)) * 10_000n + BigInt(rand(10_000)));
          else if (op === 1) await ctx.escrow.write.submitWork([id], f);
          else if (op === 2) await ctx.escrow.write.requestRevision([id], c);
          else if (op === 3) await ctx.escrow.write.release([id], c);
          else if (op === 4) await ctx.escrow.write.claimAfterTimeout([id], f);
          else if (op === 5) await ctx.escrow.write.refund([id], rand(2) ? c : f);
          else if (op === 6) await ctx.escrow.write.raiseDispute([id], rand(2) ? c : f);
          else if (op === 7) {
            const e = await ctx.escrow.read.getEscrow([id]);
            const total = e.amount + e.clientFee;
            const toF = total === 0n ? 0n : BigInt(rand(1000)) * total / 1000n;
            await ctx.escrow.write.resolveDispute([id, toF, total - toF, 0n]);
          } else await time.increase(BigInt(rand(10)) * ONE_DAY);
        } catch {
          // Invalid transitions are expected; the invariant must hold regardless.
        }

        let open = 0n;
        const n = await ctx.escrow.read.nextEscrowId();
        for (let i = 1n; i < n; i++) {
          const e = await ctx.escrow.read.getEscrow([i]);
          if (e.status === Status.Funded || e.status === Status.Submitted || e.status === Status.Disputed) {
            open += e.amount + e.clientFee;
          } else {
            expect(e.amount + e.clientFee).to.equal(0n);
            settled.add(i);
          }
        }
        expect(await bal(ctx, ctx.escrow.address)).to.equal(open);
        const total =
          (await bal(ctx, ctx.client.account.address)) +
          (await bal(ctx, ctx.freelancer.account.address)) +
          (await bal(ctx, ctx.feeRecipient.account.address)) +
          (await bal(ctx, ctx.escrow.address));
        expect(total).to.equal(ctx.float);
      }
      expect(settled.size).to.be.greaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // KNOWN RISKS — these assert CURRENT behaviour that the audit flags.
  // ──────────────────────────────────────────────────────────────────
  describe('KNOWN RISK (current behaviour, must change before mainnet)', () => {
    it('client can refund unilaterally while Funded, with no freelancer consent', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.refund([id], { account: ctx.client.account });
      expect(await status(ctx, id)).to.equal(Status.Refunded);
    });

    it('client can take delivered work, request a revision, then refund everything', async () => {
      const ctx = await loadFixture(deployFixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], { account: ctx.freelancer.account });
      await ctx.escrow.write.requestRevision([id], { account: ctx.client.account });
      await ctx.escrow.write.refund([id], { account: ctx.client.account });
      expect(await bal(ctx, ctx.client.account.address)).to.equal(before);
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(0n);
    });

    it('repeated revision requests keep auto-release out of reach indefinitely', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      for (let round = 0; round < 5; round++) {
        await ctx.escrow.write.submitWork([id], { account: ctx.freelancer.account });
        await time.increase(REVIEW_WINDOW - ONE_DAY);
        await ctx.escrow.write.requestRevision([id], { account: ctx.client.account });
      }
      await time.increase(REVIEW_WINDOW * 4n);
      await expectRevert(ctx.escrow.write.claimAfterTimeout([id]), 'InvalidStatus');
    });

    it('deliveryDeadline is stored but never enforced', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      await time.increase(365n * ONE_DAY);
      await ctx.escrow.write.submitWork([id], { account: ctx.freelancer.account });
      expect(await status(ctx, id)).to.equal(Status.Submitted);
    });

    it('a dispute freezes funds with no timeout until the owner acts', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.raiseDispute([id], { account: ctx.freelancer.account });
      await time.increase(365n * ONE_DAY);
      await expectRevert(ctx.escrow.write.refund([id], { account: ctx.client.account }));
      await expectRevert(ctx.escrow.write.release([id], { account: ctx.client.account }));
      await expectRevert(ctx.escrow.write.claimAfterTimeout([id]));
    });

    it('owner can resolve a dispute by sending 100% of the deposit to the fee recipient', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount, clientFee } = await fundOne(ctx);
      await ctx.escrow.write.raiseDispute([id], { account: ctx.client.account });
      await ctx.escrow.write.resolveDispute([id, 0n, 0n, amount + clientFee]);
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(amount + clientFee);
    });

    it('a fee increase between approval and fund() is charged to clients with a large allowance', async () => {
      const ctx = await loadFixture(deployFixture);
      await ctx.escrow.write.setDefaultFees([1000, 1000]); // e.g. front-running the client's fund()
      const before = await bal(ctx, ctx.client.account.address);
      await fundOne(ctx, USDC('1000'));
      expect(before - (await bal(ctx, ctx.client.account.address))).to.equal(USDC('1100'));
    });
  });
});
