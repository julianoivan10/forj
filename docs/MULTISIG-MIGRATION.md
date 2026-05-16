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

### Option A — automated (recommended)

```bash
# from repo root, with NEXT_PUBLIC_MULTISIG_ADDRESS already set in .env
pnpm --filter @forj/contracts transfer-ownership:sepolia
```

The script reads `NEXT_PUBLIC_MULTISIG_ADDRESS` from `.env`, uses
`DEPLOYER_PRIVATE_KEY` to sign, and:

1. Sets the fee recipient to the multisig (immediate effect; safe to
   do before ownership transfer because deployer is still owner).
2. Calls `transferOwnership(multisig)` — first leg of Ownable2Step.

It prints before/after state for both `feeRecipient` and `owner` /
`pendingOwner`. **Idempotent**: re-running after success is a no-op.

When it finishes, `pendingOwner()` is the multisig but `owner()` is
still the deployer — go to Step 2 to finalise from the Safe.

### Option B — manual via Basescan

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

(If you use Option A you've already done Step 3 — the fee recipient
update — as part of the script, so you can **skip Step 3 below** and
only do `acceptOwnership()` from the Safe.)

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

### Faster: Safe Transaction Builder JSON

A pre-built batch lives at
[`packages/contracts/scripts/safe-batches/accept-ownership-sepolia.json`](../packages/contracts/scripts/safe-batches/accept-ownership-sepolia.json).

In `app.safe.global`:
**Apps → Transaction Builder → Load batch from file** → drag this file in.

The batch is pinned to chainId 84532 (Base Sepolia), so the Safe will
refuse to load it if you're connected to the wrong network. The single
transaction calls `acceptOwnership()` on the escrow at
`0x09fb654f30637258d30e3f03b06f5370a0cf8954` — `data: 0x79ba5097` is
the function selector, no arguments needed. Safe decodes and shows the
named method before you sign (because the source is verified on
Basescan).

---

## Step 3 — Update fee recipient to Safe

> **Skip if you used Option A in Step 1** — the script already migrated
> the fee recipient before transferring ownership. Move on to Step 4.

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

### Faster: Safe Transaction Builder JSON

```json
{
  "version": "1.0",
  "chainId": "84532",
  "createdAt": 1747000000000,
  "meta": {
    "name": "Forj — Route platform fees to this Safe",
    "description": "Calls setFeeRecipient(safe) on ForjEscrow v2 so future release fees flow to multisig treasury."
  },
  "transactions": [
    {
      "to": "0x09fb654f30637258d30e3f03b06f5370a0cf8954",
      "value": "0",
      "contractMethod": {
        "inputs": [{ "internalType": "address", "name": "next", "type": "address" }],
        "name": "setFeeRecipient",
        "payable": false
      },
      "contractInputsValues": {
        "next": "0x2332373BEB6A13A61bf45881808327406DD9D5e6"
      }
    }
  ]
}
```

---

## Step 4 — Update `.env` to mirror on-chain state

```bash
# .env
NEXT_PUBLIC_MULTISIG_ADDRESS=0x2332373BEB6A13A61bf45881808327406DD9D5e6
PLATFORM_FEE_RECIPIENT=0x2332373BEB6A13A61bf45881808327406DD9D5e6
```

Both env vars are consumed by **scripts** (deploy + transfer-ownership),
not the running app, so future redeploys (e.g. v3 milestone contract)
constructor-init their owner / fee recipient to the Safe directly. The
`NEXT_PUBLIC_*` prefix is just a convention shared with frontend env
vars — the Multisig address is not actually wired into the client
bundle today; reserved for future "treasury balance" widgets.

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
