# Multisig migration runbook — Safe → ForjEscrow ownership

> Transfers ownership of the deployed `ForjEscrow` contract from the
> deployer EOA to a Safe multisig. Closes the **SC-01 + SC-02** findings
> from the audit (single-key compromise → drain of accumulated fees +
> ability to pause new funding).
>
> Runs in ~15 minutes total, mostly waiting for tx confirmations.
> Test on Base Sepolia first (this guide), then repeat on mainnet when
> ready.

---

## Pre-flight

You have:
- Safe wallet deployed at `0x2332373BEB6A13A61bf45881808327406DD9D5e6` on Base Sepolia
- Deployer EOA `0xa3b1d4ad2e756571530c9e54d4a5c52eb9E71052` with ~0.04 Sepolia ETH (for gas)
- Forj escrow at `0x09fb654f30637258d30e3f03b06f5370a0cf8954`

Verify the Safe is actually deployed (not just an address that's been
saved in app.safe.global):
```
https://sepolia.basescan.org/address/0x2332373BEB6A13A61bf45881808327406DD9D5e6
```
- "Contract" tab should be visible (Safe is a smart contract account)
- If you see "Address" only → the Safe is just a draft. Click "Activate
  Safe" in app.safe.global to deploy it. Costs ~0.001 ETH.

---

## Step 1 — Transfer ownership (initiated by current owner)

`Ownable2Step` requires two transactions: current owner calls
`transferOwnership(newOwner)`, then newOwner calls `acceptOwnership()`.
This **prevents you from accidentally transferring to a wrong address
you can't sign from**. The Safe must accept itself.

Go to https://sepolia.basescan.org/address/0x09fb654f30637258d30e3f03b06f5370a0cf8954#writeContract

1. Click **Connect to Web3** → connect MetaMask signed in as deployer
   `0xa3b1d4ad…71052`
2. Find the function `transferOwnership(address newOwner)`
3. `newOwner` = `0x2332373BEB6A13A61bf45881808327406DD9D5e6` (your Safe)
4. Click **Write** → confirm in MetaMask (small gas cost, ~$0.001 Sepolia ETH)
5. Wait for tx confirmation. Verify:
   - On Basescan, click **Read Contract** tab
   - `pendingOwner()` should now return `0x2332373BEB…D9D5e6`
   - `owner()` still returns the deployer (transfer is two-step)

---

## Step 2 — Accept ownership (from the Safe)

The Safe needs to call `acceptOwnership()` on the escrow. From the Safe UI:

1. Open https://app.safe.global, switch network to **Base Sepolia**, pick
   your Safe (`0x2332…D5e6`)
2. **New transaction** → **Contract interaction**
3. Contract address: `0x09fb654f30637258d30e3f03b06f5370a0cf8954`
4. Safe should auto-fetch the ABI (since the source is verified on
   Basescan). If not, paste the ABI from `packages/contracts/dist/forj-escrow-abi.json`
   (or use **Custom data** with the function selector for `acceptOwnership()`:
   `0x79ba5097`).
5. Pick function: `acceptOwnership()` — no args
6. Click **Create transaction** → Safe shows you the queued tx
7. Sign with your owner key in MetaMask
8. If your Safe threshold is 1-of-1 (single owner during MVP), the tx
   auto-executes after sign. For higher thresholds, other owners must
   also sign before execution.
9. Wait for confirmation. Verify on Basescan that `owner()` now returns
   `0x2332373BEB…D9D5e6`.

---

## Step 3 — Update fee recipient to Safe

Currently `feeRecipient = 0x7B3E3953bF5D6FaB66A0EC374341b6C629Ad8322`
(your personal wallet). Migrate it to the Safe so accumulated platform
fees are protected by multisig.

From the Safe (still in app.safe.global):

1. **New transaction** → **Contract interaction**
2. Contract: `0x09fb654f30637258d30e3f03b06f5370a0cf8954`
3. Function: `setFeeRecipient(address next)`
4. `next` = `0x2332373BEB6A13A61bf45881808327406DD9D5e6` (Safe itself)
5. Create + sign + execute

Verify on Basescan: `feeRecipient()` returns the Safe address.

---

## Step 4 — Update `.env` to mirror on-chain state

```bash
# .env
PLATFORM_FEE_RECIPIENT=0x2332373BEB6A13A61bf45881808327406DD9D5e6
```

This env var is consumed by the **deploy script** (not the running
app), so future redeploys (e.g. v3 milestone contract) constructor-init
their fee recipient to the Safe.

The running app reads `feeRecipient` from the contract on each release
— no app restart needed for this change to take effect.

---

## Step 5 — Verify trust model is now intact

Read every owner-privileged function from the contract and confirm
ONLY the Safe can call it:

```
https://sepolia.basescan.org/address/0x09fb654f30637258d30e3f03b06f5370a0cf8954#readContract
```

- `owner()` → `0x2332373BEB…D9D5e6` ✓
- `feeRecipient()` → `0x2332373BEB…D9D5e6` ✓
- `pendingOwner()` → `0x0000…0000` ✓ (ownership fully transferred, no pending)
- `paused()` → `false` ✓

Now try to call (from a different wallet that ISN'T the Safe):
- `setFeeRecipient()` — should revert with `OwnableUnauthorizedAccount(msg.sender)`
- `pause()` — same revert
- `resolveDispute()` — same revert

If those reverts come back, the migration succeeded. Only Safe-signed
transactions can move admin levers from this point on.

---

## What changes for users

**Nothing visibly.** Funded escrows continue exactly as before.
Releases / refunds / claims still work the same way — those have
NEVER been gated on owner, they're gated on the parties (client +
freelancer).

The only difference: the platform's emergency levers (pause new
funding, resolve disputes, sweep fees, change defaults) now require
the Safe threshold of signatures. Single-key compromise no longer
risks user funds OR future fees.

---

## Rollback (if migration goes wrong)

If you transferred ownership to a Safe you can't actually sign from
(e.g. you lost access to the Safe owner key BEFORE accepting ownership):

- **Before Step 2**: deployer is still owner. Just don't call accept;
  call `transferOwnership` again to a different address you control.
- **After Step 2**: ownership has moved. You can recover via Safe's
  own recovery mechanisms (social recovery if configured, or contact
  Safe support if you have admin keys to the underlying owner wallet).
- **Worst case**: deploy a v2.1 contract from a new deployer key,
  migrate users. v2 escrows continue to operate, just the contract
  becomes effectively abandoned (no admin levers).

The Pausable killswitch is owner-gated, so even a frozen-admin v2
**doesn't lock user funds** — withdrawals still work. This is by
design (audit finding SC-03 mitigation).

---

## Mainnet migration

When ready for Base mainnet:
1. Deploy a NEW Safe on Base mainnet (separate from Sepolia)
2. Deploy ForjEscrow to Base mainnet with `feeRecipient` = new mainnet Safe
3. Constructor sets `owner` = deployer initially
4. Repeat Steps 1-5 above on mainnet

Production Safe should ideally be **2-of-3 or 3-of-5 multisig** (not
1-of-1) so a single lost key isn't catastrophic. The Sepolia Safe can
stay 1-of-1 for testing convenience.

Recommended owner mix for production:
- 1× hot key on a hardware wallet you carry (Ledger / Trezor)
- 1× cold key in a safety deposit box or family vault
- 1× co-founder's hardware wallet (or trusted advisor)
- Threshold 2-of-3: any 2 can sign, no single point of failure

---

## Pimlico whitelist note

The Pimlico sponsorship policy whitelist is keyed on **contract
address** (escrow) not on ownership. Migrating ownership doesn't
require touching Pimlico. Same address, same allowed-contracts list,
sponsored UserOps continue working.

The only Pimlico action you'd take is RE-VERIFYING that the sponsorship
policy still allows the escrow address after deploy. Already checked
during the v2 deploy — no further action needed.
