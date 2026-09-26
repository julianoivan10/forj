import 'server-only';
import { PrivyClient } from '@privy-io/server-auth';
import { and, db, eq, isNull, users } from '@forj/db';
import type { User } from '@forj/db';
import { log } from '@forj/api';

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;

let client: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!appId || !appSecret) {
    throw new Error('Privy credentials not set (NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET)');
  }
  if (!client) {
    client = new PrivyClient(appId, appSecret);
  }
  return client;
}

const isDev = process.env.NODE_ENV !== 'production';

/** Stages that mean misconfiguration or outage rather than a bad token. */
const OPERATIONAL_STAGES = new Set(['getPrivyClient', 'db provisioning']);

function logAuthError(stage: string, err: unknown) {
  if (!isDev) {
    if (OPERATIONAL_STAGES.has(stage)) log('error', 'auth.failure', { stage, err });
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[privy/auth] ${stage} failed: ${msg}`);
}

/**
 * Pull the user's canonical on-chain address from a Privy User record.
 *
 * Priority:
 *   1. Smart wallet (ERC-4337) — when smart wallets are enabled in the
 *      Privy dashboard, every authenticated user gets one provisioned. This
 *      is the address that:
 *        - shows up as `msg.sender` in our escrow funding UserOps
 *        - is what wagmi's `useAccount()` returns inside the app
 *        - should receive USDC payouts (so the user can spend them
 *          gas-free via the same smart wallet)
 *      We must save this — not the underlying EOA — as the DB
 *      `walletAddress`, otherwise the freelancer's `release()` payout
 *      goes to a wallet they can't see in the UI (since the UI queries
 *      balances from the smart wallet).
 *
 *   2. Embedded EOA (Privy's default before smart wallets were enabled).
 *      Falls back here when smart wallets are off in the dashboard.
 *
 *   3. First linked external wallet (e.g. MetaMask connect) — last
 *      resort, only used if the user signed up via wallet-only flow.
 */
function pickCanonicalWallet(privyUser: unknown): string | null {
  const view = privyUser as {
    wallet?: { address?: string };
    linkedAccounts?: Array<{ type?: string; address?: string }>;
  };
  const smart = view.linkedAccounts?.find((a) => a?.type === 'smart_wallet')?.address;
  if (smart) return smart;
  const eoa = view.wallet?.address;
  if (eoa) return eoa;
  return view.linkedAccounts?.find((a) => a?.type === 'wallet')?.address ?? null;
}

/**
 * Verify a Privy access token and return the associated DB user.
 *
 * If the token is valid but no DB user exists yet (webhook hasn't fired),
 * we auto-provision the user record inline ("just-in-time provisioning").
 * This guarantees that `user.me` always succeeds after a valid Privy login.
 *
 * Errors are swallowed and logged in development so callers can distinguish
 * "not logged in" from "misconfigured" via the server console.
 */
export async function getUserFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;

  let privy: PrivyClient;
  try {
    privy = getPrivyClient();
  } catch (err) {
    logAuthError('getPrivyClient', err);
    return null;
  }

  let verified: Awaited<ReturnType<PrivyClient['verifyAuthToken']>>;
  try {
    verified = await privy.verifyAuthToken(token);
  } catch (err) {
    logAuthError('verifyAuthToken', err);
    return null;
  }

  try {
    // Try to find existing user by privyId (the common case).
    const existing = await db.query.users.findFirst({
      where: eq(users.privyId, verified.userId),
    });
    if (existing) {
      // Soft-deleted accounts must NOT log back in. The DB row still
      // exists for FK integrity (contracts, reviews still reference it),
      // but its PII has been anonymised and the user explicitly chose to
      // leave. Treat the session as unauthenticated so they go through
      // signup again — a fresh row will be provisioned with a different
      // privyId (Privy will hand out a new one via `privy.deleteUser` we
      // call from `user.deleteAccount`).
      if (existing.deletedAt) {
        logAuthError(
          'soft-deleted account attempted to log in',
          new Error(`userId=${existing.id}`),
        );
        return null;
      }

      // Wallet auto-sync on subsequent logins.
      //
      // Two scenarios trigger a write here:
      //
      //  (a) `walletAddress = null` — first-login race: our session
      //      handler fires before Privy finishes provisioning the
      //      embedded wallet, so the JIT insert below saved `null`.
      //      Without a self-heal step the user can never fund an escrow
      //      because every proc that reads `walletAddress` would 400.
      //
      //  (b) Smart-wallet upgrade: the user signed up before smart
      //      wallets were enabled in the Privy dashboard, so their DB
      //      row has the EOA. Now smart wallets are on and Privy has
      //      provisioned one — but the wagmi connector + balance hooks
      //      use the smart wallet, so the UI shows 0 USDC because the
      //      DB still points at the EOA. We migrate them forward.
      //
      // Both swallow Privy errors so a transient outage doesn't break
      // login — wallet stays stale until the next successful sync.
      try {
        const privyUser = await privy.getUser(verified.userId);
        // Normalize to lowercase BEFORE writing — EVM addresses are
        // case-insensitive but Postgres `=` is case-sensitive. Without
        // normalization, Privy's `0xABC…` one login and `0xabc…` the
        // next would both pass the "different from existing" check
        // and rewrite the row every session.
        const canonical = pickCanonicalWallet(privyUser)?.toLowerCase() ?? null;
        const needsSync =
          canonical &&
          (!existing.walletAddress ||
            existing.walletAddress.toLowerCase() !== canonical);
        if (needsSync) {
          const [synced] = await db
            .update(users)
            .set({ walletAddress: canonical })
            .where(eq(users.id, existing.id))
            .returning();
          return synced ?? { ...existing, walletAddress: canonical };
        }
      } catch (err) {
        logAuthError('wallet sync (existing user)', err);
      }

      return existing;
    }

    // Privy gave us a user we've never seen. Pull their profile so we can decide
    // between re-linking an existing account or provisioning a fresh one.
    let wallet: string | undefined;
    let email: string | undefined;
    let displayName = 'Forj User';

    try {
      const privyUser = await privy.getUser(verified.userId);
      // Privy's User type varies by provider; narrow via a loose view so we can
      // read OAuth fields (google/twitter/github) without coupling to private types.
      const view = privyUser as unknown as {
        email?: { address?: string };
        google?: { email?: string; name?: string };
      };
      // Use `pickCanonicalWallet` so smart-wallet users save the smart
      // wallet (not the underlying EOA) as their `users.walletAddress`.
      // The smart wallet is what wagmi exposes and what receives payouts —
      // see `pickCanonicalWallet` for the full reasoning.
      // Lowercase at the source — every downstream comparison + DB
      // store assumes lowercase, so normalize once here.
      wallet = pickCanonicalWallet(privyUser)?.toLowerCase() ?? undefined;
      email = view.email?.address ?? view.google?.email ?? undefined;
      const googleName = view.google?.name;
      displayName = googleName ?? email?.split('@')[0] ?? 'Forj User';
    } catch (err) {
      logAuthError('getPrivyUser', err);
    }

    // ── Re-link heuristic ──────────────────────────────────────
    // Privy assigns a new userId when a user logs in via a method that isn't
    // linked to their existing Privy account. If we recognise them by a
    // cryptographically-proven handle (wallet address), re-associate this new
    // privyId to their existing DB row instead of creating a duplicate.
    //
    // Wallet matching is safe: Privy verifies wallet ownership via signature.
    // Email matching is deliberately NOT used here — Privy accepts unverified
    // email in some flows, and auto-merging by email would be an account takeover
    // vector.
    if (wallet) {
      // Normalize wallet lookup to lowercase — same case-insensitivity
      // concern as the sync branch above. Also FILTER soft-deleted
      // rows: a fresh Privy session shouldn't be auto-bound to a
      // wallet that belonged to a deleted account, because that
      // would silently grant the new user access to the deleted
      // user's reputation/history. If a real human is recovering a
      // deleted account, that's the `admin.restoreUser` path.
      const walletLc = wallet.toLowerCase();
      const byWallet = await db.query.users.findFirst({
        where: and(eq(users.walletAddress, walletLc), isNull(users.deletedAt)),
      });
      if (byWallet) {
        const [relinked] = await db
          .update(users)
          .set({
            privyId: verified.userId,
            // Fill in email if Privy now has one and our row was missing it.
            email: byWallet.email ?? email,
          })
          .where(eq(users.id, byWallet.id))
          .returning();
        return relinked ?? byWallet;
      }
    }

    // ── Just-in-time provisioning ──────────────────────────────
    // Genuinely new user — the Privy webhook hasn't created them yet (race
    // condition or webhook not configured in local dev). Create the row inline.
    const [newUser] = await db
      .insert(users)
      .values({
        privyId: verified.userId,
        walletAddress: wallet,
        email,
        displayName,
      })
      .onConflictDoNothing({ target: users.privyId })
      .returning();

    // If onConflictDoNothing fired (race with webhook), re-fetch
    if (!newUser) {
      const reFetched = await db.query.users.findFirst({
        where: eq(users.privyId, verified.userId),
      });
      return reFetched ?? null;
    }

    return newUser;
  } catch (err) {
    logAuthError('db provisioning', err);
    return null;
  }
}

export { getPrivyClient };
