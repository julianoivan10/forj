# Safe Transaction Builder batches

Pre-built JSON payloads for [Safe Transaction Builder](https://help.safe.global/en/articles/40841-using-the-transaction-builder-safe-app).
Drag-drop into **Apps → Transaction Builder → Load batch from file** at
[app.safe.global](https://app.safe.global) while connected to the right
network and Safe.

Each file is pinned to a specific `chainId` and contract address — the
Safe will refuse to load it on the wrong network, which is the safety
net we want here.

## Files

| File | Network | Purpose |
|---|---|---|
| `accept-ownership-sepolia.json` | Base Sepolia (84532) | Step 2 of multisig handoff — Safe calls `acceptOwnership()` on ForjEscrow v2 at `0x09fb654f...8954` after the deployer EOA already called `transferOwnership(safe)`. Finalises Ownable2Step. |

## Adding a new batch

1. Build the batch in the Safe UI (Apps → Transaction Builder → New
   transaction → fill in contract + method + args → keep adding).
2. Click **Save to Library** → **Export**. Drop the resulting JSON in
   this folder with a descriptive name.
3. Add a row to the table above.

Keeping batches in-repo gives us:
- A reviewable diff when admin operations change.
- A reproducible record of *what* was signed, separate from the
  multisig signer log.
- A single source of truth so any signer can sign the same batch
  without re-typing function selectors from memory.

## Verifying a batch before signing

Before signing in Safe:
1. Check the **contract address** matches what's in `addresses.ts` for
   the target network.
2. Check the **function name + args** match what the batch says it
   does (Safe UI shows decoded calldata once the ABI is verified on
   Basescan).
3. Cross-reference the `data` field if there's any doubt — function
   selectors are the first 4 bytes of `keccak256("functionName(types)")`.
