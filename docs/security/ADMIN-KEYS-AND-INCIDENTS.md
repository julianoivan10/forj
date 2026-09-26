# Admin authority, keys and incident response

## Authorities

| Authority | Holds | Can | Cannot | Testnet today | Mainnet target |
|---|---|---|---|---|---|
| Deployer key | `DEPLOYER_PRIVATE_KEY` | deploy contracts | anything after deployment, once roles are handed over | EOA `0xA3B1…1052` (also holds V3 roles) | hardware wallet or Safe-proposed deploy; no roles after deploy |
| V3 owner | contract role | fees (≤ 10% each, future escrows only), windows, revision cap, arbiter, guardian, fee recipient, unpause, rescue non-USDC | move escrowed USDC, resolve disputes, change funded escrows | deployer EOA | **TimelockController (48 h) controlled by a 2-of-3 Safe** |
| V3 arbiter | contract role | choose the freelancer share of a disputed escrow before its deadline | resolve after the deadline or for its own escrows; send funds anywhere else; exceed the agreed fee | deployer EOA | **separate 2-of-3 Safe** (different signers from the owner where possible) |
| V3 guardian | contract role | pause new funding | unpause, move funds | deployer EOA | hot key or Safe with fast response, pause-only |
| v2 escrow owner | ForjEscrow v2 | resolve v2 disputes (never reachable on-chain, see audit), fees | – | Safe `0x2332…d5e6` | wind down |
| App admin | `ADMIN_USER_IDS` + Privy session | list disputes, record arbiter transactions (with an audit reason), relink or restore users, articles, sync status, manual reconcile | move funds (the chain enforces roles) | – | add a second factor and two-person approval for `relinkUser` |
| App runtime | Vercel | read chain state | sign anything: holds **no key** | – | – |

Why a timelock on the owner: every owner action affects only future escrows, so a 48-hour delay
costs nothing operationally. It gives users time to see a fee or arbiter change coming, and time to
stop funding. The guardian stays fast because pausing new funding is the only emergency action that
matters and it can't hurt existing escrows.

### Handing over testnet roles before a public testnet

```solidity
setArbiter(<arbiter Safe>)           // from current owner
setGuardian(<guardian key or Safe>)
transferOwnership(<timelock or Safe>) → acceptOwnership() from the new owner
```

Then confirm with reads: `owner()`, `pendingOwner()`, `arbiter()`, `guardian()`.

## Incident response

| Signal | First response |
|---|---|
| Suspected contract bug or exploit | **Guardian: `pause()`**. Stops new funding; existing escrows can still settle, refund and resolve, so users are never locked in. Announce. Investigate. There is no upgrade: a fix means a new contract and moving new escrows to it. |
| Arbiter key compromise | Owner: `setArbiter(new)`. Worst case for an open dispute before that: a share the attacker chooses, still within the fee bound, and only for already-disputed escrows. |
| Owner key compromise | With a timelock, cancel the queued operation. Without one: attacker can raise fees for **future** escrows only (≤ 10%), change the arbiter, or pause. Pause funding in the app (UI) and warn users. |
| Guardian key compromise | Owner: `setGuardian(0)` and `unpause()`. |
| `escrow.drift_detected` / `sync_issue` | `admin.escrowSyncStatus`; run `admin.runEscrowSync`. Chain is authoritative; never edit escrow columns by hand. |
| Payments stuck pending | Check the transaction on Basescan. Pending rows auto-fail after 30 min if never mined; users can retry. |
| Webhook signature failures spike | Check `PRIVY_WEBHOOK_SECRET` rotation; failures are rejected, never processed. |
| `ratelimit.disabled` in production | Restore Upstash variables immediately. |
| Leaked deployer key | Rotate; it holds no production roles once they are handed over. On testnet today it holds all V3 roles: hand them over first. |

## Rules

- Never put private keys in the root `.env`, Vercel, logs or the browser.
- Never give the app runtime a signing key for escrow funds.
- Every admin action that touches money is audit-logged (`admin_audit_log`) with a reason.
- Mainnet contract roles are Safes (and a timelock for the owner) before the first real escrow.
