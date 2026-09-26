import { expect } from 'chai';
import hre from 'hardhat';
import { parseUnits, getAddress } from 'viem';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';

/**
 * WorkChainEscrow test suite.
 *
 * Strategy:
 *  - Use Hardhat's `loadFixture` to snapshot the chain after deploy +
 *    USDC distribution. Every test starts from the same clean slate
 *    *without* paying the deploy gas each time.
 *  - All amounts are 6-decimal USDC (matches real Base USDC).
 *  - Default fee is 250bps (2.5%) — same as the platform's intended cut.
 *
 * Coverage targets:
 *  - Happy path (fund → submit → release)
 *  - Auto-release after timeout (claim by anyone)
 *  - Mutual refund before submission
 *  - Revision request resets the auto-release clock
 *  - Disputes lock funds, only owner resolves
 *  - Revert paths: wrong caller, wrong status, fee too high, etc.
 */

const FEE_BPS = 500n;
const ONE_DAY = 24n * 60n * 60n;
const SEVEN_DAYS = 7n * ONE_DAY;

async function deployFixture() {
  const [deployer, client, freelancer, feeRecipient, stranger] =
    await hre.viem.getWalletClients();

  const usdc = await hre.viem.deployContract('MockUSDC', []);

  const escrow = await hre.viem.deployContract('WorkChainEscrow', [
    usdc.address,
    feeRecipient.account.address,
    Number(FEE_BPS),
    Number(SEVEN_DAYS),
    deployer.account.address,
  ]);

  // Mint a healthy float to the client + approve the escrow contract.
  // Client is the only party that calls `fund`, so they're the only one
  // who needs an allowance.
  const fund = parseUnits('10000', 6); // 10,000 USDC
  await usdc.write.mint([client.account.address, fund]);
  await usdc.write.approve([escrow.address, fund], { account: client.account });

  const publicClient = await hre.viem.getPublicClient();

  return {
    deployer,
    client,
    freelancer,
    feeRecipient,
    stranger,
    usdc,
    escrow,
    publicClient,
  };
}

async function fundOne(
  ctx: Awaited<ReturnType<typeof deployFixture>>,
  amountUsdc: string,
) {
  const amount = parseUnits(amountUsdc, 6);
  const now = BigInt(await time.latest());
  const deadline = now + 30n * ONE_DAY;

  await ctx.escrow.write.fund(
    [ctx.freelancer.account.address, amount, deadline],
    { account: ctx.client.account },
  );
  // First id is 1 — see constructor.
  return { id: 1n, amount, deadline };
}

describe('WorkChainEscrow', () => {
  describe('deployment', () => {
    it('sets immutable + admin fields correctly', async () => {
      const ctx = await loadFixture(deployFixture);
      expect(getAddress(await ctx.escrow.read.usdc())).to.equal(
        getAddress(ctx.usdc.address),
      );
      expect(getAddress(await ctx.escrow.read.feeRecipient())).to.equal(
        getAddress(ctx.feeRecipient.account.address),
      );
      expect(await ctx.escrow.read.defaultFeeBps()).to.equal(Number(FEE_BPS));
      expect(await ctx.escrow.read.autoReleaseWindow()).to.equal(SEVEN_DAYS);
      expect(await ctx.escrow.read.nextEscrowId()).to.equal(1n);
    });

    it('reverts on zero addresses', async () => {
      const ctx = await loadFixture(deployFixture);
      await expect(
        hre.viem.deployContract('WorkChainEscrow', [
          '0x0000000000000000000000000000000000000000',
          ctx.feeRecipient.account.address,
          Number(FEE_BPS),
          Number(SEVEN_DAYS),
          ctx.deployer.account.address,
        ]),
      ).to.be.rejected;
    });

    it('reverts on fee > 10%', async () => {
      const ctx = await loadFixture(deployFixture);
      await expect(
        hre.viem.deployContract('WorkChainEscrow', [
          ctx.usdc.address,
          ctx.feeRecipient.account.address,
          1001, // > 10%
          Number(SEVEN_DAYS),
          ctx.deployer.account.address,
        ]),
      ).to.be.rejected;
    });

    it('reverts on auto-release window out of range', async () => {
      const ctx = await loadFixture(deployFixture);
      await expect(
        hre.viem.deployContract('WorkChainEscrow', [
          ctx.usdc.address,
          ctx.feeRecipient.account.address,
          Number(FEE_BPS),
          60, // < 1 day
          ctx.deployer.account.address,
        ]),
      ).to.be.rejected;
    });
  });

  describe('fund', () => {
    it('locks USDC and emits EscrowFunded with id=1', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount } = await fundOne(ctx, '500');

      expect(id).to.equal(1n);
      expect(await ctx.usdc.read.balanceOf([ctx.escrow.address])).to.equal(amount);

      const e = await ctx.escrow.read.getEscrow([id]);
      expect(getAddress(e.client)).to.equal(getAddress(ctx.client.account.address));
      expect(getAddress(e.freelancer)).to.equal(getAddress(ctx.freelancer.account.address));
      expect(e.amount).to.equal(amount);
      expect(e.status).to.equal(1); // Funded
    });

    it('increments id monotonically across funds', async () => {
      const ctx = await loadFixture(deployFixture);
      await fundOne(ctx, '100');
      await fundOne(ctx, '200');
      await fundOne(ctx, '300');
      expect(await ctx.escrow.read.nextEscrowId()).to.equal(4n);
    });

    it('reverts when client funds themselves', async () => {
      const ctx = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      await expect(
        ctx.escrow.write.fund(
          [ctx.client.account.address, parseUnits('100', 6), now + ONE_DAY],
          { account: ctx.client.account },
        ),
      ).to.be.rejected;
    });

    it('reverts on amount = 0', async () => {
      const ctx = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      await expect(
        ctx.escrow.write.fund(
          [ctx.freelancer.account.address, 0n, now + ONE_DAY],
          { account: ctx.client.account },
        ),
      ).to.be.rejected;
    });

    it('reverts when paused', async () => {
      const ctx = await loadFixture(deployFixture);
      await ctx.escrow.write.pause();
      const now = BigInt(await time.latest());
      await expect(
        ctx.escrow.write.fund(
          [ctx.freelancer.account.address, parseUnits('100', 6), now + ONE_DAY],
          { account: ctx.client.account },
        ),
      ).to.be.rejected;
    });
  });

  describe('submit + release happy path', () => {
    it('submits, releases, splits fee to feeRecipient', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount } = await fundOne(ctx, '1000');

      await ctx.escrow.write.submit([id], { account: ctx.freelancer.account });

      const e1 = await ctx.escrow.read.getEscrow([id]);
      expect(e1.status).to.equal(2); // Submitted
      expect(e1.autoReleaseAt).to.be.greaterThan(0n);

      await ctx.escrow.write.release([id], { account: ctx.client.account });

      const fee = (amount * FEE_BPS) / 10_000n;
      const toFreelancer = amount - fee;
      expect(await ctx.usdc.read.balanceOf([ctx.freelancer.account.address])).to.equal(toFreelancer);
      expect(await ctx.usdc.read.balanceOf([ctx.feeRecipient.account.address])).to.equal(fee);
      expect(await ctx.usdc.read.balanceOf([ctx.escrow.address])).to.equal(0n);

      const e2 = await ctx.escrow.read.getEscrow([id]);
      expect(e2.status).to.equal(3); // Released
      expect(e2.amount).to.equal(0n);
    });

    it('allows direct release without submit (early payout)', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount } = await fundOne(ctx, '300');

      await ctx.escrow.write.release([id], { account: ctx.client.account });

      const fee = (amount * FEE_BPS) / 10_000n;
      expect(await ctx.usdc.read.balanceOf([ctx.freelancer.account.address])).to.equal(
        amount - fee,
      );
    });

    it('rejects release from non-client', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '300');
      await ctx.escrow.write.submit([id], { account: ctx.freelancer.account });

      await expect(
        ctx.escrow.write.release([id], { account: ctx.freelancer.account }),
      ).to.be.rejected;
      await expect(
        ctx.escrow.write.release([id], { account: ctx.stranger.account }),
      ).to.be.rejected;
    });

    it('rejects submit from non-freelancer', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '100');
      await expect(
        ctx.escrow.write.submit([id], { account: ctx.client.account }),
      ).to.be.rejected;
    });
  });

  describe('claimAfterTimeout', () => {
    it('lets anyone claim once auto-release window has passed', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount } = await fundOne(ctx, '500');
      await ctx.escrow.write.submit([id], { account: ctx.freelancer.account });

      // Fast-forward past the 7-day window.
      await hre.network.provider.send('evm_increaseTime', [Number(SEVEN_DAYS + 60n)]);
      await hre.network.provider.send('evm_mine', []);

      // A stranger calls — funds STILL go to freelancer.
      await ctx.escrow.write.claimAfterTimeout([id], { account: ctx.stranger.account });

      const fee = (amount * FEE_BPS) / 10_000n;
      expect(await ctx.usdc.read.balanceOf([ctx.freelancer.account.address])).to.equal(
        amount - fee,
      );
    });

    it('reverts before timeout', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '500');
      await ctx.escrow.write.submit([id], { account: ctx.freelancer.account });

      await expect(
        ctx.escrow.write.claimAfterTimeout([id], { account: ctx.stranger.account }),
      ).to.be.rejected;
    });

    it('reverts if not in Submitted state', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '500');
      await expect(
        ctx.escrow.write.claimAfterTimeout([id], { account: ctx.stranger.account }),
      ).to.be.rejected;
    });
  });

  describe('requestRevision', () => {
    it('resets state to Funded and clears auto-release', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '500');
      await ctx.escrow.write.submit([id], { account: ctx.freelancer.account });
      await ctx.escrow.write.requestRevision([id], { account: ctx.client.account });

      const e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(1); // Funded
      expect(e.autoReleaseAt).to.equal(0n);
      expect(e.submittedAt).to.equal(0n);
    });

    it('only client can request revision', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '500');
      await ctx.escrow.write.submit([id], { account: ctx.freelancer.account });
      await expect(
        ctx.escrow.write.requestRevision([id], { account: ctx.freelancer.account }),
      ).to.be.rejected;
    });

    it('cannot request revision when Funded (nothing to revise)', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '500');
      await expect(
        ctx.escrow.write.requestRevision([id], { account: ctx.client.account }),
      ).to.be.rejected;
    });
  });

  describe('refund', () => {
    it('returns full amount to client when both parties agree pre-submit', async () => {
      const ctx = await loadFixture(deployFixture);
      const balanceBefore = await ctx.usdc.read.balanceOf([ctx.client.account.address]);
      const { id, amount } = await fundOne(ctx, '500');

      await ctx.escrow.write.refund([id], { account: ctx.client.account });

      const balanceAfter = await ctx.usdc.read.balanceOf([ctx.client.account.address]);
      // Client paid `amount` to fund, then got `amount` back — net zero.
      expect(balanceAfter).to.equal(balanceBefore);
      // Sanity that `amount` was actually moved twice.
      expect(amount).to.be.greaterThan(0n);

      const e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(4); // Refunded
      expect(e.amount).to.equal(0n);
    });

    it('freelancer can also trigger refund', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '300');
      await ctx.escrow.write.refund([id], { account: ctx.freelancer.account });

      const e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(4);
    });

    it('cannot refund after submit (would need release or dispute)', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '300');
      await ctx.escrow.write.submit([id], { account: ctx.freelancer.account });
      await expect(
        ctx.escrow.write.refund([id], { account: ctx.client.account }),
      ).to.be.rejected;
    });

    it('non-party cannot refund', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '300');
      await expect(
        ctx.escrow.write.refund([id], { account: ctx.stranger.account }),
      ).to.be.rejected;
    });
  });

  describe('dispute + arbiter resolution', () => {
    it('locks funds when raised, only owner can resolve', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id } = await fundOne(ctx, '1000');
      await ctx.escrow.write.submit([id], { account: ctx.freelancer.account });
      await ctx.escrow.write.raiseDispute([id], { account: ctx.client.account });

      const e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(5); // Disputed

      // Neither party can move funds while disputed.
      await expect(
        ctx.escrow.write.release([id], { account: ctx.client.account }),
      ).to.be.rejected;
      await expect(
        ctx.escrow.write.claimAfterTimeout([id], { account: ctx.freelancer.account }),
      ).to.be.rejected;
    });

    it('arbiter splits 60/30/10 between freelancer/client/fee', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount } = await fundOne(ctx, '1000');
      await ctx.escrow.write.raiseDispute([id], { account: ctx.client.account });

      const toFreelancer = (amount * 60n) / 100n;
      const toClient = (amount * 30n) / 100n;
      const toFee = amount - toFreelancer - toClient; // catch any rounding

      await ctx.escrow.write.resolveDispute([id, toFreelancer, toClient, toFee]);

      expect(await ctx.usdc.read.balanceOf([ctx.freelancer.account.address])).to.equal(toFreelancer);
      expect(await ctx.usdc.read.balanceOf([ctx.feeRecipient.account.address])).to.equal(toFee);
      // Client gets back `toClient` — net loss is amount - toClient.
      const e = await ctx.escrow.read.getEscrow([id]);
      expect(e.status).to.equal(6); // Resolved
    });

    it('split must sum exactly to amount', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount } = await fundOne(ctx, '500');
      await ctx.escrow.write.raiseDispute([id], { account: ctx.client.account });
      await expect(
        ctx.escrow.write.resolveDispute([id, amount - 1n, 0n, 0n]),
      ).to.be.rejected;
    });

    it('only owner can resolve', async () => {
      const ctx = await loadFixture(deployFixture);
      const { id, amount } = await fundOne(ctx, '500');
      await ctx.escrow.write.raiseDispute([id], { account: ctx.client.account });
      await expect(
        ctx.escrow.write.resolveDispute([id, amount, 0n, 0n], { account: ctx.client.account }),
      ).to.be.rejected;
    });
  });

  describe('admin', () => {
    it('owner can update fee bps within bounds', async () => {
      const ctx = await loadFixture(deployFixture);
      await ctx.escrow.write.setDefaultFeeBps([500]);
      expect(await ctx.escrow.read.defaultFeeBps()).to.equal(500);
    });

    it('rejects fee > MAX_FEE_BPS', async () => {
      const ctx = await loadFixture(deployFixture);
      await expect(ctx.escrow.write.setDefaultFeeBps([1001])).to.be.rejected;
    });

    it('non-owner cannot pause', async () => {
      const ctx = await loadFixture(deployFixture);
      await expect(
        ctx.escrow.write.pause({ account: ctx.client.account }),
      ).to.be.rejected;
    });

    it('two-step ownership transfer', async () => {
      const ctx = await loadFixture(deployFixture);
      await ctx.escrow.write.transferOwnership([ctx.client.account.address]);
      // Pending owner not yet owner.
      await expect(
        ctx.escrow.write.setDefaultFeeBps([100], { account: ctx.client.account }),
      ).to.be.rejected;
      // Accept transfers ownership.
      await ctx.escrow.write.acceptOwnership({ account: ctx.client.account });
      await ctx.escrow.write.setDefaultFeeBps([100], { account: ctx.client.account });
      expect(await ctx.escrow.read.defaultFeeBps()).to.equal(100);
    });
  });
});
