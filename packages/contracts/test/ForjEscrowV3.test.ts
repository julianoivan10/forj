import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, keccak256, maxUint128, parseUnits, toHex, zeroAddress, zeroHash } from 'viem';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';

/**
 * ForjEscrowV3 specification tests.
 *
 * Written against the intended rules in docs/escrow/ESCROW-V3.md, not
 * against observed behaviour. What these establish: the implemented state
 * machine, access control, accounting and bounds match that specification
 * on a local Hardhat chain with a standard 6-decimal token. What they do
 * NOT establish: absence of unknown vulnerabilities, correct behaviour of
 * real Circle USDC edge cases (blocklists/upgrades), or economic safety
 * of the rules themselves. An external audit is still required.
 */

const USDC = (v: string) => parseUnits(v, 6);
const DAY = 24n * 60n * 60n;
const CLIENT_BPS = 500;
const FREELANCER_BPS = 200;
const REVIEW = 7n * DAY;
const REVISION = 7n * DAY;
const DISPUTE = 14n * DAY;

enum S {
  None = 0,
  Funded = 1,
  Submitted = 2,
  RevisionRequested = 3,
  Disputed = 4,
  Released = 5,
  Refunded = 6,
  Resolved = 7,
}

const ref = (n: number | string) => keccak256(toHex(`forj:contract:${n}`));

async function expectRevert(p: Promise<unknown>, reason?: string) {
  try {
    await p;
  } catch (err) {
    if (reason) expect((err as Error).message).to.include(reason);
    return;
  }
  expect.fail(`expected revert${reason ? ` (${reason})` : ''}`);
}

async function deploy(tokenName = 'MockUSDC') {
  const [owner, client, freelancer, feeRecipient, arbiter, guardian, stranger, client2, freelancer2] =
    await hre.viem.getWalletClients();
  const token = await hre.viem.deployContract(tokenName as 'MockUSDC', []);
  const escrow = await hre.viem.deployContract('ForjEscrowV3', [
    token.address,
    owner!.account.address,
    feeRecipient!.account.address,
    arbiter!.account.address,
    guardian!.account.address,
    CLIENT_BPS,
    FREELANCER_BPS,
  ]);
  const float = USDC('1000000');
  for (const w of [client!, client2!]) {
    await token.write.mint([w.account.address, float]);
    await token.write.approve([escrow.address, float], { account: w.account });
  }
  return {
    owner: owner!, client: client!, freelancer: freelancer!, feeRecipient: feeRecipient!,
    arbiter: arbiter!, guardian: guardian!, stranger: stranger!, client2: client2!, freelancer2: freelancer2!,
    token, escrow, float,
  };
}
const fixture = () => deploy();
type Ctx = Awaited<ReturnType<typeof fixture>>;

let refCounter = 0;
async function fundOne(
  ctx: Ctx,
  opts: { amount?: bigint; deliveryIn?: bigint; contractRef?: `0x${string}`; client?: Ctx['client']; freelancer?: Ctx['freelancer'] } = {},
) {
  const amount = opts.amount ?? USDC('1000');
  const client = opts.client ?? ctx.client;
  const freelancer = opts.freelancer ?? ctx.freelancer;
  const deadline = BigInt(await time.latest()) + (opts.deliveryIn ?? 30n * DAY);
  const contractRef = opts.contractRef ?? ref(`auto-${refCounter++}`);
  const id = await ctx.escrow.read.nextEscrowId();
  await ctx.escrow.write.fund([contractRef, freelancer.account.address, amount, deadline, CLIENT_BPS, FREELANCER_BPS], {
    account: client.account,
  });
  return { id, amount, clientFee: (amount * BigInt(CLIENT_BPS)) / 10_000n, contractRef, deadline };
}

const as = (w: { account: { address: `0x${string}` } }) => ({ account: w.account as never });
const bal = (ctx: Ctx, a: `0x${string}`) => ctx.token.read.balanceOf([a]);
const state = async (ctx: Ctx, id: bigint) => (await ctx.escrow.read.getEscrow([id])).status;

describe('ForjEscrowV3', () => {
  // ───────────────────────────────────────────────────────────── deployment
  describe('deployment and configuration', () => {
    it('stores roles, fees and default windows', async () => {
      const ctx = await loadFixture(fixture);
      expect(getAddress(await ctx.escrow.read.owner())).to.equal(getAddress(ctx.owner.account.address));
      expect(getAddress(await ctx.escrow.read.arbiter())).to.equal(getAddress(ctx.arbiter.account.address));
      expect(getAddress(await ctx.escrow.read.guardian())).to.equal(getAddress(ctx.guardian.account.address));
      expect(await ctx.escrow.read.defaultClientFeeBps()).to.equal(CLIENT_BPS);
      expect(await ctx.escrow.read.defaultFreelancerFeeBps()).to.equal(FREELANCER_BPS);
      expect(await ctx.escrow.read.reviewWindow()).to.equal(Number(REVIEW));
      expect(await ctx.escrow.read.revisionWindow()).to.equal(Number(REVISION));
      expect(await ctx.escrow.read.disputeWindow()).to.equal(Number(DISPUTE));
      expect(await ctx.escrow.read.maxRevisions()).to.equal(2);
    });

    it('rejects zero token, fee recipient or arbiter, and fees above 10%', async () => {
      const ctx = await loadFixture(fixture);
      const a = [ctx.token.address, ctx.owner.account.address, ctx.feeRecipient.account.address, ctx.arbiter.account.address, zeroAddress, CLIENT_BPS, FREELANCER_BPS] as const;
      const variants: unknown[][] = [
        [zeroAddress, ...a.slice(1)],
        [a[0], a[1], zeroAddress, ...a.slice(3)],
        [a[0], a[1], a[2], zeroAddress, ...a.slice(4)],
        [...a.slice(0, 5), 1001, FREELANCER_BPS],
        [...a.slice(0, 5), CLIENT_BPS, 1001],
      ];
      for (const v of variants) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await expectRevert(hre.viem.deployContract('ForjEscrowV3', v as any));
      }
    });

    it('ownership cannot be renounced and transfers in two steps', async () => {
      const ctx = await loadFixture(fixture);
      await expectRevert(ctx.escrow.write.renounceOwnership(), 'RenounceDisabled');
      await ctx.escrow.write.transferOwnership([ctx.stranger.account.address]);
      await expectRevert(ctx.escrow.write.setMaxRevisions([1], as(ctx.stranger)), 'OwnableUnauthorizedAccount');
      await ctx.escrow.write.acceptOwnership(as(ctx.stranger));
      await ctx.escrow.write.setMaxRevisions([1], as(ctx.stranger));
    });

    it('bounds every configurable parameter', async () => {
      const ctx = await loadFixture(fixture);
      await expectRevert(ctx.escrow.write.setDefaultFees([1001, 0]), 'FeeTooHigh');
      await expectRevert(ctx.escrow.write.setDefaultFees([0, 1001]), 'FeeTooHigh');
      await expectRevert(ctx.escrow.write.setWindows([Number(DAY) - 1, Number(DAY), Number(3n * DAY)]), 'WindowOutOfRange');
      await expectRevert(ctx.escrow.write.setWindows([Number(DAY), Number(31n * DAY), Number(3n * DAY)]), 'WindowOutOfRange');
      await expectRevert(ctx.escrow.write.setWindows([Number(DAY), Number(DAY), Number(2n * DAY)]), 'WindowOutOfRange');
      await expectRevert(ctx.escrow.write.setWindows([Number(DAY), Number(DAY), Number(61n * DAY)]), 'WindowOutOfRange');
      await expectRevert(ctx.escrow.write.setMaxRevisions([6]), 'RevisionCapOutOfRange');
      await expectRevert(ctx.escrow.write.setArbiter([zeroAddress]), 'InvalidAddress');
      await expectRevert(ctx.escrow.write.setFeeRecipient([zeroAddress]), 'InvalidAddress');
    });
  });

  // ───────────────────────────────────────────────────────────────── funding
  describe('fund', () => {
    it('pulls amount + client fee, snapshots terms and emits the contract reference', async () => {
      const ctx = await loadFixture(fixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id, amount, clientFee, contractRef, deadline } = await fundOne(ctx);
      expect(before - (await bal(ctx, ctx.client.account.address))).to.equal(amount + clientFee);
      const e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(S.Funded);
      expect(e.contractRef).to.equal(contractRef);
      expect(e.workDeadline).to.equal(deadline);
      expect(e.maxRevisions).to.equal(2);
      expect(e.freelancerFeeBps).to.equal(FREELANCER_BPS);
      expect(await ctx.escrow.read.escrowIdByRef([ctx.client.account.address, contractRef])).to.equal(id);
      const [ev] = await ctx.escrow.getEvents.EscrowFunded();
      expect(ev!.args.contractRef).to.equal(contractRef);
      expect(ev!.args.amount).to.equal(amount);
    });

    it('quoteFund matches the pulled deposit', async () => {
      const ctx = await loadFixture(fixture);
      const [total, fee] = await ctx.escrow.read.quoteFund([USDC('1234.56')]);
      expect(fee).to.equal((USDC('1234.56') * 500n) / 10_000n);
      expect(total).to.equal(USDC('1234.56') + fee);
    });

    it('rejects a duplicate reference from the same client, and zero references', async () => {
      const ctx = await loadFixture(fixture);
      await fundOne(ctx, { contractRef: ref('dup') });
      await expectRevert(fundOne(ctx, { contractRef: ref('dup') }), 'DuplicateReference');
      await expectRevert(fundOne(ctx, { contractRef: zeroHash }), 'InvalidReference');
    });

    it('a third party cannot squat a reference to block the real client', async () => {
      const ctx = await loadFixture(fixture);
      // Attacker (client2) funds first with the victim contract's reference.
      const squat = await fundOne(ctx, { contractRef: ref('victim'), client: ctx.client2, freelancer: ctx.freelancer2 });
      const real = await fundOne(ctx, { contractRef: ref('victim') });
      expect(await ctx.escrow.read.escrowIdByRef([ctx.client.account.address, ref('victim')])).to.equal(real.id);
      expect(await ctx.escrow.read.escrowIdByRef([ctx.client2.account.address, ref('victim')])).to.equal(squat.id);
    });

    it('rejects invalid participants, amounts and deadlines', async () => {
      const ctx = await loadFixture(fixture);
      const now = BigInt(await time.latest());
      const f = (freelancer: `0x${string}`, amount: bigint, deadline: bigint) =>
        ctx.escrow.write.fund([ref(`bad-${amount}-${deadline}-${freelancer}`), freelancer, amount, deadline, CLIENT_BPS, FREELANCER_BPS], as(ctx.client));
      await expectRevert(f(zeroAddress, USDC('10'), now + DAY), 'InvalidAddress');
      await expectRevert(f(ctx.client.account.address, USDC('10'), now + DAY), 'InvalidAddress');
      await expectRevert(f(ctx.freelancer.account.address, 0n, now + DAY), 'InvalidAmount');
      await expectRevert(f(ctx.freelancer.account.address, 999_999n, now + DAY), 'InvalidAmount'); // < 1 USDC at 6 decimals
      await expectRevert(f(ctx.freelancer.account.address, USDC('10'), now), 'InvalidDeadline');
      await expectRevert(f(ctx.freelancer.account.address, USDC('10'), now + 366n * DAY), 'InvalidDeadline');
    });

    it('fee limits stop a fee change between agreement and funding', async () => {
      const ctx = await loadFixture(fixture);
      await ctx.escrow.write.setDefaultFees([1000, FREELANCER_BPS]); // e.g. landed just before the client's tx
      await expectRevert(fundOne(ctx), 'FeeAboveAcceptedLimit');
      await ctx.escrow.write.setDefaultFees([CLIENT_BPS, 1000]);
      await expectRevert(fundOne(ctx), 'FeeAboveAcceptedLimit');
    });

    it('later configuration changes never alter a funded escrow', async () => {
      const ctx = await loadFixture(fixture);
      const { id, amount } = await fundOne(ctx);
      await ctx.escrow.write.setDefaultFees([0, 1000]);
      await ctx.escrow.write.setMaxRevisions([0]);
      await ctx.escrow.write.setWindows([Number(DAY), Number(DAY), Number(3n * DAY)]);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      const e = await ctx.escrow.read.getEscrow([id]);
      expect(e.reviewWindow).to.equal(Number(REVIEW));
      await ctx.escrow.write.requestRevision([id], as(ctx.client)); // snapshot cap 2 still applies
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await ctx.escrow.write.release([id], as(ctx.client));
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(amount - (amount * 200n) / 10_000n);
    });

    it('is blocked by pause; everything else keeps working', async () => {
      const ctx = await loadFixture(fixture);
      const a = await fundOne(ctx);
      const b = await fundOne(ctx);
      await ctx.escrow.write.pause(as(ctx.guardian));
      await expectRevert(fundOne(ctx), 'EnforcedPause');
      await ctx.escrow.write.submitWork([a.id], as(ctx.freelancer));
      await ctx.escrow.write.raiseDispute([a.id], as(ctx.client));
      await ctx.escrow.write.resolveDispute([a.id, 5000], as(ctx.arbiter));
      await ctx.escrow.write.cancelByFreelancer([b.id], as(ctx.freelancer));
    });

    it('rejects fee-on-transfer tokens instead of recording money it did not receive', async () => {
      const ctx = await deploy('MockFeeOnTransferToken');
      await expectRevert(fundOne(ctx as Ctx), 'UnsupportedToken');
    });

    it('handles the uint128 maximum without overflow', async () => {
      const ctx = await loadFixture(fixture);
      const big = maxUint128 / 2n;
      await ctx.token.write.mint([ctx.client.account.address, maxUint128]);
      await ctx.token.write.approve([ctx.escrow.address, maxUint128], as(ctx.client));
      const { id, clientFee } = await fundOne(ctx, { amount: big });
      await ctx.escrow.write.release([id], as(ctx.client));
      const fFee = (big * 200n) / 10_000n;
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(big - fFee);
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(clientFee + fFee);
    });
  });

  // ──────────────────────────────────────────────────────────── normal flow
  describe('normal flow', () => {
    it('fund → submit → release pays 980 / 70 on a 1,000 USDC job', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      expect(await state(ctx, id)).to.equal(S.Submitted);
      await ctx.escrow.write.release([id], as(ctx.client));
      expect(await state(ctx, id)).to.equal(S.Released);
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('980'));
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(USDC('70'));
      expect(await bal(ctx, ctx.escrow.address)).to.equal(0n);
      const [ev] = await ctx.escrow.getEvents.Released();
      expect(ev!.args.byTimeout).to.equal(false);
    });

    it('client may pay early, before any submission', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.release([id], as(ctx.client));
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('980'));
    });

    it('anyone can settle to the freelancer after the review window; not one second earlier', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      const { reviewDeadline } = await ctx.escrow.read.getEscrow([id]);
      await time.setNextBlockTimestamp(reviewDeadline);
      await expectRevert(ctx.escrow.write.releaseAfterReview([id], as(ctx.stranger)), 'DeadlineNotReached');
      await time.setNextBlockTimestamp(reviewDeadline + 1n);
      await ctx.escrow.write.releaseAfterReview([id], as(ctx.stranger));
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('980'));
      const [ev] = await ctx.escrow.getEvents.Released();
      expect(ev!.args.byTimeout).to.equal(true);
    });
  });

  // ───────────────────────────────────────────────────────────── revisions
  describe('revisions', () => {
    it('request → resubmit → approve, with counters and deadlines', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await ctx.escrow.write.requestRevision([id], as(ctx.client));
      let e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(S.RevisionRequested);
      expect(e.revisionCount).to.equal(1);
      expect(e.workDeadline).to.equal(BigInt(await time.latest()) + REVISION);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(S.Submitted);
      const subs = await ctx.escrow.getEvents.WorkSubmitted();
      expect(subs[0]!.args.submissionNumber).to.equal(2);
      await ctx.escrow.write.release([id], as(ctx.client));
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('980'));
    });

    it('enforces the maximum number of revisions', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      for (let i = 0; i < 2; i++) {
        await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
        await ctx.escrow.write.requestRevision([id], as(ctx.client));
      }
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await expectRevert(ctx.escrow.write.requestRevision([id], as(ctx.client)), 'RevisionLimitReached');
      // The only client choices left are release or dispute; otherwise the timeout pays out.
      await time.increase(REVIEW + 1n);
      await ctx.escrow.write.releaseAfterReview([id]);
      expect(await state(ctx, id)).to.equal(S.Released);
    });

    it('a zero revision cap disables revisions entirely', async () => {
      const ctx = await loadFixture(fixture);
      await ctx.escrow.write.setMaxRevisions([0]);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await expectRevert(ctx.escrow.write.requestRevision([id], as(ctx.client)), 'RevisionLimitReached');
    });

    it('a revision cannot be requested after the review deadline', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await time.increase(REVIEW + 1n);
      await expectRevert(ctx.escrow.write.requestRevision([id], as(ctx.client)), 'DeadlinePassed');
    });

    it('a resubmission after the revision deadline is rejected and the client may then refund', async () => {
      const ctx = await loadFixture(fixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await ctx.escrow.write.requestRevision([id], as(ctx.client));
      await time.increase(REVISION + 1n);
      await expectRevert(ctx.escrow.write.submitWork([id], as(ctx.freelancer)), 'DeadlinePassed');
      await ctx.escrow.write.refundAfterDeadline([id], as(ctx.client));
      expect(await bal(ctx, ctx.client.account.address)).to.equal(before);
    });
  });

  // ─────────────────────────────────────────────────────────────── refunds
  describe('refunds', () => {
    it('freelancer can cancel from Funded, Submitted or RevisionRequested; full deposit returned, no fee', async () => {
      for (const reach of ['Funded', 'Submitted', 'RevisionRequested'] as const) {
        const ctx = await loadFixture(fixture);
        const before = await bal(ctx, ctx.client.account.address);
        const { id } = await fundOne(ctx);
        if (reach !== 'Funded') await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
        if (reach === 'RevisionRequested') await ctx.escrow.write.requestRevision([id], as(ctx.client));
        await ctx.escrow.write.cancelByFreelancer([id], as(ctx.freelancer));
        expect(await state(ctx, id)).to.equal(S.Refunded);
        expect(await bal(ctx, ctx.client.account.address)).to.equal(before);
        expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(0n);
      }
    });

    it('client cannot refund before the work deadline', async () => {
      const ctx = await loadFixture(fixture);
      const { id, deadline } = await fundOne(ctx);
      await time.setNextBlockTimestamp(deadline);
      await expectRevert(ctx.escrow.write.refundAfterDeadline([id], as(ctx.client)), 'DeadlineNotReached');
    });

    it('client can refund once the work deadline passes with no submission', async () => {
      const ctx = await loadFixture(fixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id, deadline } = await fundOne(ctx);
      await time.setNextBlockTimestamp(deadline + 1n);
      await ctx.escrow.write.refundAfterDeadline([id], as(ctx.client));
      expect(await bal(ctx, ctx.client.account.address)).to.equal(before);
      const [ev] = await ctx.escrow.getEvents.Refunded();
      expect(ev!.args.reason).to.equal(1); // DeadlineMissed
    });

    it('client cannot refund after the freelancer submitted, even long after the deadline', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await time.increase(400n * DAY);
      await expectRevert(ctx.escrow.write.refundAfterDeadline([id], as(ctx.client)), 'InvalidStatus');
    });

    it('client cannot refund during a dispute', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await ctx.escrow.write.raiseDispute([id], as(ctx.client));
      await time.increase(400n * DAY);
      await expectRevert(ctx.escrow.write.refundAfterDeadline([id], as(ctx.client)), 'InvalidStatus');
    });

    it('only the right party can call each refund path', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await expectRevert(ctx.escrow.write.cancelByFreelancer([id], as(ctx.client)), 'NotFreelancer');
      await expectRevert(ctx.escrow.write.cancelByFreelancer([id], as(ctx.stranger)), 'NotFreelancer');
      await time.increase(31n * DAY);
      await expectRevert(ctx.escrow.write.refundAfterDeadline([id], as(ctx.freelancer)), 'NotClient');
      await expectRevert(ctx.escrow.write.refundAfterDeadline([id], as(ctx.stranger)), 'NotClient');
      await expectRevert(ctx.escrow.write.refundAfterDeadline([id], as(ctx.arbiter)), 'NotClient');
    });
  });

  // ────────────────────────────────────────────────────────────── disputes
  describe('disputes', () => {
    async function disputed(ctx: Ctx, by: 'client' | 'freelancer' = 'client') {
      const f = await fundOne(ctx);
      await ctx.escrow.write.submitWork([f.id], as(ctx.freelancer));
      if (by === 'freelancer') {
        await ctx.escrow.write.requestRevision([f.id], as(ctx.client));
        await ctx.escrow.write.raiseDispute([f.id], as(ctx.freelancer));
      } else {
        await ctx.escrow.write.raiseDispute([f.id], as(ctx.client));
      }
      return f;
    }

    it('client disputes during review; freelancer disputes an outstanding revision', async () => {
      const ctx = await loadFixture(fixture);
      const a = await disputed(ctx, 'client');
      const b = await disputed(ctx, 'freelancer');
      for (const { id } of [a, b]) {
        const e = await ctx.escrow.read.getEscrow([id]);
        expect(e.status).to.equal(S.Disputed);
        expect(e.disputeDeadline).to.be.greaterThan(0n);
      }
      const evs = await ctx.escrow.getEvents.DisputeRaised();
      expect(evs.length).to.equal(1); // getEvents returns the latest block only
    });

    it('dispute windows: no client dispute after review, none from Funded, none by strangers', async () => {
      const ctx = await loadFixture(fixture);
      const f = await fundOne(ctx);
      await expectRevert(ctx.escrow.write.raiseDispute([f.id], as(ctx.client)), 'InvalidStatus');
      await expectRevert(ctx.escrow.write.raiseDispute([f.id], as(ctx.freelancer)), 'InvalidStatus');
      await ctx.escrow.write.submitWork([f.id], as(ctx.freelancer));
      await expectRevert(ctx.escrow.write.raiseDispute([f.id], as(ctx.freelancer)), 'InvalidStatus');
      await expectRevert(ctx.escrow.write.raiseDispute([f.id], as(ctx.stranger)), 'NotParty');
      await time.increase(REVIEW + 1n);
      await expectRevert(ctx.escrow.write.raiseDispute([f.id], as(ctx.client)), 'DeadlinePassed');
    });

    it('arbiter resolution: 100% freelancer equals a normal release', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await disputed(ctx);
      await ctx.escrow.write.resolveDispute([id, 10_000], as(ctx.arbiter));
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('980'));
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(USDC('70'));
      expect(await state(ctx, id)).to.equal(S.Resolved);
    });

    it('arbiter resolution: 0% freelancer is a full refund with no fee', async () => {
      const ctx = await loadFixture(fixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id } = await disputed(ctx);
      await ctx.escrow.write.resolveDispute([id, 0], as(ctx.arbiter));
      expect(await bal(ctx, ctx.client.account.address)).to.equal(before);
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(0n);
    });

    it('arbiter resolution: 60/40 split charges fees only on the freelancer share', async () => {
      const ctx = await loadFixture(fixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id } = await disputed(ctx);
      await ctx.escrow.write.resolveDispute([id, 6000], as(ctx.arbiter));
      // gross 600, freelancer fee 12, client-fee kept 30 → freelancer 588, fee 42, client 400 + 20
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('588'));
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(USDC('42'));
      expect(before - (await bal(ctx, ctx.client.account.address))).to.equal(USDC('630'));
      expect(await bal(ctx, ctx.escrow.address)).to.equal(0n);
    });

    it('no share can route more than the agreed fee to the fee recipient', async () => {
      const ctx = await loadFixture(fixture);
      for (const share of [0, 1, 2500, 5000, 7777, 9999, 10_000]) {
        const { id, amount, clientFee } = await disputed(ctx);
        const feeBefore = await bal(ctx, ctx.feeRecipient.account.address);
        await ctx.escrow.write.resolveDispute([id, share], as(ctx.arbiter));
        const fee = (await bal(ctx, ctx.feeRecipient.account.address)) - feeBefore;
        expect(fee <= clientFee + (amount * 200n) / 10_000n).to.equal(true);
      }
      const { id } = await disputed(ctx);
      await expectRevert(ctx.escrow.write.resolveDispute([id, 10_001], as(ctx.arbiter)), 'InvalidShare');
    });

    it('only the arbiter resolves — not the owner, guardian, parties or strangers', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await disputed(ctx);
      for (const w of [ctx.owner, ctx.guardian, ctx.client, ctx.freelancer, ctx.stranger]) {
        await expectRevert(ctx.escrow.write.resolveDispute([id, 10_000], as(w)), 'NotArbiter');
      }
    });

    it('an arbiter who is a party to the escrow cannot resolve it', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await disputed(ctx);
      await ctx.escrow.write.setArbiter([ctx.client.account.address]);
      await expectRevert(ctx.escrow.write.resolveDispute([id, 0], as(ctx.client)), 'ArbiterIsParty');
    });

    it('after the dispute deadline the arbiter is locked out and anyone applies the 50/50 no-fee default', async () => {
      const ctx = await loadFixture(fixture);
      const before = await bal(ctx, ctx.client.account.address);
      const { id } = await disputed(ctx);
      const { disputeDeadline } = await ctx.escrow.read.getEscrow([id]);
      await time.setNextBlockTimestamp(disputeDeadline);
      await expectRevert(ctx.escrow.write.resolveExpiredDispute([id], as(ctx.stranger)), 'DeadlineNotReached');
      await time.setNextBlockTimestamp(disputeDeadline + 1n);
      await expectRevert(ctx.escrow.write.resolveDispute([id, 10_000], as(ctx.arbiter)), 'DeadlinePassed');
      await ctx.escrow.write.resolveExpiredDispute([id], as(ctx.stranger));
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('500'));
      expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(0n);
      expect(before - (await bal(ctx, ctx.client.account.address))).to.equal(USDC('500'));
      const [ev] = await ctx.escrow.getEvents.DisputeResolved();
      expect(ev!.args.byTimeout).to.equal(true);
    });

    it('nothing but resolution moves a disputed escrow', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await disputed(ctx);
      await expectRevert(ctx.escrow.write.release([id], as(ctx.client)), 'InvalidStatus');
      await expectRevert(ctx.escrow.write.cancelByFreelancer([id], as(ctx.freelancer)), 'InvalidStatus');
      await expectRevert(ctx.escrow.write.submitWork([id], as(ctx.freelancer)), 'InvalidStatus');
      await expectRevert(ctx.escrow.write.releaseAfterReview([id]), 'InvalidStatus');
      await expectRevert(ctx.escrow.write.raiseDispute([id], as(ctx.client)), 'InvalidStatus');
    });
  });

  // ───────────────────────────────────────────────────── state matrix
  describe('state × action matrix', () => {
    type Action =
      | 'submit' | 'revise' | 'release' | 'releaseAfterReview' | 'cancel'
      | 'refundAfterDeadline' | 'disputeClient' | 'disputeFreelancer' | 'resolve' | 'resolveExpired';
    const ACTIONS: Action[] = ['submit', 'revise', 'release', 'releaseAfterReview', 'cancel', 'refundAfterDeadline', 'disputeClient', 'disputeFreelancer', 'resolve', 'resolveExpired'];
    type St = 'Funded' | 'Submitted' | 'RevisionRequested' | 'Disputed' | 'Released' | 'Refunded' | 'Resolved';

    // Allowed actions right after reaching the state (all deadlines open).
    const OPEN: Record<St, Action[]> = {
      Funded: ['submit', 'release', 'cancel'],
      Submitted: ['revise', 'release', 'cancel', 'disputeClient'],
      RevisionRequested: ['submit', 'release', 'cancel', 'disputeFreelancer'],
      Disputed: ['resolve'],
      Released: [], Refunded: [], Resolved: [],
    };
    // Allowed actions after every deadline has passed (400 days later).
    const EXPIRED: Record<St, Action[]> = {
      Funded: ['release', 'cancel', 'refundAfterDeadline'],
      Submitted: ['release', 'releaseAfterReview', 'cancel'],
      RevisionRequested: ['release', 'cancel', 'refundAfterDeadline'],
      Disputed: ['resolveExpired'],
      Released: [], Refunded: [], Resolved: [],
    };

    async function reach(ctx: Ctx, st: St) {
      const { id } = await fundOne(ctx);
      const w = ctx.escrow.write;
      if (st === 'Released') await w.release([id], as(ctx.client));
      if (st === 'Refunded') await w.cancelByFreelancer([id], as(ctx.freelancer));
      if (['Submitted', 'RevisionRequested', 'Disputed', 'Resolved'].includes(st)) await w.submitWork([id], as(ctx.freelancer));
      if (st === 'RevisionRequested') await w.requestRevision([id], as(ctx.client));
      if (st === 'Disputed' || st === 'Resolved') await w.raiseDispute([id], as(ctx.client));
      if (st === 'Resolved') await w.resolveDispute([id, 5000], as(ctx.arbiter));
      return id;
    }

    function run(ctx: Ctx, a: Action, id: bigint) {
      const w = ctx.escrow.write;
      switch (a) {
        case 'submit': return w.submitWork([id], as(ctx.freelancer));
        case 'revise': return w.requestRevision([id], as(ctx.client));
        case 'release': return w.release([id], as(ctx.client));
        case 'releaseAfterReview': return w.releaseAfterReview([id], as(ctx.stranger));
        case 'cancel': return w.cancelByFreelancer([id], as(ctx.freelancer));
        case 'refundAfterDeadline': return w.refundAfterDeadline([id], as(ctx.client));
        case 'disputeClient': return w.raiseDispute([id], as(ctx.client));
        case 'disputeFreelancer': return w.raiseDispute([id], as(ctx.freelancer));
        case 'resolve': return w.resolveDispute([id, 5000], as(ctx.arbiter));
        case 'resolveExpired': return w.resolveExpiredDispute([id], as(ctx.stranger));
      }
    }

    for (const [mode, table] of [['deadlines open', OPEN], ['deadlines expired', EXPIRED]] as const) {
      for (const st of Object.keys(table) as St[]) {
        for (const a of ACTIONS) {
          const ok = table[st].includes(a);
          it(`[${mode}] ${st} → ${a}: ${ok ? 'allowed' : 'reverts'}`, async () => {
            const ctx = await loadFixture(fixture);
            const id = await reach(ctx, st);
            if (mode === 'deadlines expired') await time.increase(400n * DAY);
            const held = await bal(ctx, ctx.escrow.address);
            const before = await state(ctx, id);
            if (ok) {
              await run(ctx, a, id);
            } else {
              await expectRevert(run(ctx, a, id));
              expect(await bal(ctx, ctx.escrow.address)).to.equal(held);
              expect(await state(ctx, id)).to.equal(before);
            }
          });
        }
      }
    }

    it('unknown escrow ids revert for every action', async () => {
      const ctx = await loadFixture(fixture);
      for (const a of ACTIONS) await expectRevert(run(ctx, a, 42n));
    });
  });

  // ─────────────────────────────────────────────────────── access control
  describe('access control', () => {
    it('owner-only functions reject arbiter, guardian and strangers', async () => {
      const ctx = await loadFixture(fixture);
      for (const w of [ctx.arbiter, ctx.guardian, ctx.stranger]) {
        await expectRevert(ctx.escrow.write.setArbiter([w.account.address], as(w)), 'OwnableUnauthorizedAccount');
        await expectRevert(ctx.escrow.write.setGuardian([w.account.address], as(w)), 'OwnableUnauthorizedAccount');
        await expectRevert(ctx.escrow.write.setFeeRecipient([w.account.address], as(w)), 'OwnableUnauthorizedAccount');
        await expectRevert(ctx.escrow.write.setDefaultFees([0, 0], as(w)), 'OwnableUnauthorizedAccount');
        await expectRevert(ctx.escrow.write.setWindows([Number(DAY), Number(DAY), Number(3n * DAY)], as(w)), 'OwnableUnauthorizedAccount');
        await expectRevert(ctx.escrow.write.setMaxRevisions([0], as(w)), 'OwnableUnauthorizedAccount');
        await expectRevert(ctx.escrow.write.unpause(as(w)), 'OwnableUnauthorizedAccount');
        await expectRevert(ctx.escrow.write.rescueToken([zeroAddress, w.account.address, 1n], as(w)), 'OwnableUnauthorizedAccount');
      }
    });

    it('guardian and owner can pause; only the owner can unpause; others cannot pause', async () => {
      const ctx = await loadFixture(fixture);
      await expectRevert(ctx.escrow.write.pause(as(ctx.stranger)), 'NotGuardian');
      await expectRevert(ctx.escrow.write.pause(as(ctx.arbiter)), 'NotGuardian');
      await ctx.escrow.write.pause(as(ctx.guardian));
      await expectRevert(ctx.escrow.write.unpause(as(ctx.guardian)), 'OwnableUnauthorizedAccount');
      await ctx.escrow.write.unpause();
      await ctx.escrow.write.pause();
    });

    it('the owner cannot touch escrowed USDC but can rescue other tokens', async () => {
      const ctx = await loadFixture(fixture);
      await fundOne(ctx);
      await expectRevert(ctx.escrow.write.rescueToken([ctx.token.address, ctx.owner.account.address, 1n]), 'CannotRescueUSDC');
      const other = await hre.viem.deployContract('MockUSDC', []);
      await other.write.mint([ctx.escrow.address, 5n]);
      await ctx.escrow.write.rescueToken([other.address, ctx.stranger.account.address, 5n]);
      expect(await other.read.balanceOf([ctx.stranger.account.address])).to.equal(5n);
    });

    it('parties cannot act on each other’s escrows', async () => {
      const ctx = await loadFixture(fixture);
      const mine = await fundOne(ctx);
      const theirs = await fundOne(ctx, { client: ctx.client2, freelancer: ctx.freelancer2 });
      await expectRevert(ctx.escrow.write.submitWork([theirs.id], as(ctx.freelancer)), 'NotFreelancer');
      await expectRevert(ctx.escrow.write.release([theirs.id], as(ctx.client)), 'NotClient');
      await expectRevert(ctx.escrow.write.cancelByFreelancer([theirs.id], as(ctx.freelancer)), 'NotFreelancer');
      await expectRevert(ctx.escrow.write.submitWork([mine.id], as(ctx.freelancer2)), 'NotFreelancer');
    });
  });

  // ──────────────────────────────────────────────── adversarial behaviour
  describe('adversarial tokens and replays', () => {
    it('re-entrancy through the token cannot trigger a second, permissionless settlement', async () => {
      const ctx = await deploy('MockReentrantToken');
      const token = await hre.viem.getContractAt('MockReentrantToken', ctx.token.address);
      const a = await fundOne(ctx as Ctx);
      const b = await fundOne(ctx as Ctx);
      await ctx.escrow.write.submitWork([b.id], as(ctx.freelancer));
      await time.increase(REVIEW + 1n); // b is now claimable by anyone
      await token.write.arm([ctx.escrow.address, encodeFunctionData({ abi: ctx.escrow.abi, functionName: 'releaseAfterReview', args: [b.id] })]);
      await ctx.escrow.write.release([a.id], as(ctx.client));
      expect(await token.read.attackAttempted()).to.equal(true);
      expect(await token.read.attackSucceeded()).to.equal(false);
      expect((await ctx.escrow.read.getEscrow([b.id])).status).to.equal(S.Submitted);
    });

    it('a blocklisted freelancer blocks release; the dispute path still recovers the funds', async () => {
      const ctx = await deploy('MockBlocklistToken');
      const token = await hre.viem.getContractAt('MockBlocklistToken', ctx.token.address);
      const { id } = await fundOne(ctx as Ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await token.write.setBlocked([ctx.freelancer.account.address, true]);
      await expectRevert(ctx.escrow.write.release([id], as(ctx.client)));
      await ctx.escrow.write.raiseDispute([id], as(ctx.client));
      await ctx.escrow.write.resolveDispute([id, 0], as(ctx.arbiter));
      expect(await ctx.token.read.balanceOf([ctx.escrow.address])).to.equal(0n);
    });

    it('repeated or duplicate calls settle exactly once', async () => {
      const ctx = await loadFixture(fixture);
      const { id } = await fundOne(ctx);
      await ctx.escrow.write.submitWork([id], as(ctx.freelancer));
      await expectRevert(ctx.escrow.write.submitWork([id], as(ctx.freelancer)), 'InvalidStatus');
      await ctx.escrow.write.release([id], as(ctx.client));
      await expectRevert(ctx.escrow.write.release([id], as(ctx.client)), 'InvalidStatus');
      await time.increase(REVIEW + 1n);
      await expectRevert(ctx.escrow.write.releaseAfterReview([id]), 'InvalidStatus');
      await expectRevert(ctx.escrow.write.cancelByFreelancer([id], as(ctx.freelancer)), 'InvalidStatus');
      expect(await bal(ctx, ctx.freelancer.account.address)).to.equal(USDC('980'));
    });

    it('many escrows between the same parties stay independent', async () => {
      const ctx = await loadFixture(fixture);
      const escrows = [];
      for (let i = 0; i < 5; i++) escrows.push(await fundOne(ctx, { amount: USDC(String(100 * (i + 1))) }));
      await ctx.escrow.write.release([escrows[2]!.id], as(ctx.client));
      await ctx.escrow.write.cancelByFreelancer([escrows[4]!.id], as(ctx.freelancer));
      for (const [i, e] of escrows.entries()) {
        const onchain = await ctx.escrow.read.getEscrow([e.id]);
        expect(onchain.status).to.equal(i === 2 ? S.Released : i === 4 ? S.Refunded : S.Funded);
        expect(await ctx.escrow.read.escrowIdByRef([ctx.client.account.address, e.contractRef])).to.equal(e.id);
      }
      const open = escrows.filter((_, i) => i !== 2 && i !== 4).reduce((s, e) => s + e.amount + e.clientFee, 0n);
      expect(await bal(ctx, ctx.escrow.address)).to.equal(open);
    });
  });

  // ─────────────────────────────────────────────────── property / invariants
  describe('invariants (seeded random walks)', () => {
    for (const seedStart of [0x5eed, 0xbeef, 0x1234]) {
      it(`seed ${seedStart.toString(16)}: solvency, bounded fees, terminal finality, one settlement per escrow`, async () => {
        const ctx = await loadFixture(fixture);
        // mulberry32: a plain LCG's low bits cycle too fast for `% n`,
        // which correlated actor and operation choices.
        let seed = seedStart >>> 0;
        const rand = (n: number) => {
          seed = (seed + 0x6d2b79f5) >>> 0;
          let t = seed;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return (((t ^ (t >>> 14)) >>> 0) % n);
        };
        const clients = [ctx.client, ctx.client2];
        const freelancers = [ctx.freelancer, ctx.freelancer2];
        const agreedFee = new Map<bigint, bigint>();
        const terminal = new Set<bigint>();
        const TERMINAL = [S.Released, S.Refunded, S.Resolved];

        for (let step = 0; step < 150; step++) {
          const n = await ctx.escrow.read.nextEscrowId();
          const id = n > 1n ? BigInt(1 + rand(Number(n - 1n))) : 1n;
          const e = n > 1n ? await ctx.escrow.read.getEscrow([id]) : null;
          const c = e ? clients.find((w) => getAddress(w.account.address) === getAddress(e.client))! : ctx.client;
          const f = e ? freelancers.find((w) => getAddress(w.account.address) === getAddress(e.freelancer))! : ctx.freelancer;
          const actor = [c, f, ctx.arbiter, ctx.stranger][rand(4)]!;
          const op = n === 1n ? 0 : rand(12);
          try {
            if (op === 0) {
              const k = rand(2);
              const r = await fundOne(ctx, { client: clients[k], freelancer: freelancers[k], amount: USDC(String(1 + rand(5000))) + BigInt(rand(1_000_000)), deliveryIn: BigInt(1 + rand(20)) * DAY });
              agreedFee.set(r.id, r.clientFee + (r.amount * 200n) / 10_000n);
            } else if (op === 1) await ctx.escrow.write.submitWork([id], as(actor));
            else if (op === 2) await ctx.escrow.write.requestRevision([id], as(actor));
            else if (op === 3) await ctx.escrow.write.release([id], as(actor));
            else if (op === 4) await ctx.escrow.write.releaseAfterReview([id], as(actor));
            else if (op === 5) await ctx.escrow.write.cancelByFreelancer([id], as(actor));
            else if (op === 6) await ctx.escrow.write.refundAfterDeadline([id], as(actor));
            else if (op === 7) await ctx.escrow.write.raiseDispute([id], as(actor));
            else if (op === 8) await ctx.escrow.write.resolveDispute([id, rand(10_001)], as(actor));
            else if (op === 9) await ctx.escrow.write.resolveExpiredDispute([id], as(actor));
            else await time.increase(BigInt(rand(10)) * DAY + BigInt(rand(3600)));
          } catch {
            // invalid transitions are expected; invariants must hold regardless
          }

          const next = await ctx.escrow.read.nextEscrowId();
          let open = 0n;
          for (let i = 1n; i < next; i++) {
            const x = await ctx.escrow.read.getEscrow([i]);
            if (TERMINAL.includes(x.status)) {
              terminal.add(i);
              expect(x.amount + x.clientFee).to.equal(0n);
            } else {
              expect(terminal.has(i), `escrow ${i} left a terminal state`).to.equal(false);
              open += x.amount + x.clientFee;
            }
          }
          expect(await bal(ctx, ctx.escrow.address)).to.equal(open);
          const all = [ctx.client, ctx.client2, ctx.freelancer, ctx.freelancer2, ctx.feeRecipient];
          let total = await bal(ctx, ctx.escrow.address);
          for (const w of all) total += await bal(ctx, w.account.address);
          expect(total).to.equal(ctx.float * 2n);
        }

        // Per-escrow deterministic accounting from the settlement events.
        const released = await ctx.escrow.getEvents.Released({}, { fromBlock: 0n });
        const refunded = await ctx.escrow.getEvents.Refunded({}, { fromBlock: 0n });
        const resolved = await ctx.escrow.getEvents.DisputeResolved({}, { fromBlock: 0n });
        const funded = await ctx.escrow.getEvents.EscrowFunded({}, { fromBlock: 0n });
        const deposit = new Map(funded.map((ev) => [ev.args.escrowId!, ev.args.amount! + ev.args.clientFee!]));
        const settlements = new Map<bigint, number>();
        let feesPaid = 0n;
        for (const ev of released) {
          settlements.set(ev.args.escrowId!, (settlements.get(ev.args.escrowId!) ?? 0) + 1);
          expect(ev.args.toFreelancer! + ev.args.toFee!).to.equal(deposit.get(ev.args.escrowId!));
          expect(ev.args.toFee! <= agreedFee.get(ev.args.escrowId!)!).to.equal(true);
          feesPaid += ev.args.toFee!;
        }
        for (const ev of refunded) {
          settlements.set(ev.args.escrowId!, (settlements.get(ev.args.escrowId!) ?? 0) + 1);
          expect(ev.args.toClient).to.equal(deposit.get(ev.args.escrowId!));
        }
        for (const ev of resolved) {
          settlements.set(ev.args.escrowId!, (settlements.get(ev.args.escrowId!) ?? 0) + 1);
          expect(ev.args.toFreelancer! + ev.args.toClient! + ev.args.toFee!).to.equal(deposit.get(ev.args.escrowId!));
          expect(ev.args.toFee! <= agreedFee.get(ev.args.escrowId!)!).to.equal(true);
          feesPaid += ev.args.toFee!;
        }
        for (const id of terminal) expect(settlements.get(id), `escrow ${id} settlements`).to.equal(1);
        expect(settlements.size).to.equal(terminal.size);
        expect(await bal(ctx, ctx.feeRecipient.account.address)).to.equal(feesPaid);
        expect(terminal.size).to.be.greaterThan(3);
      });
    }
  });
});
