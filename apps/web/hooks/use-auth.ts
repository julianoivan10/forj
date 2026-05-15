'use client';

import { useLogin, usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/trpc/client';
import { PRIVY_APP_ID } from '@/lib/privy/config';
import { logger } from '@/lib/logger';

export const hasPrivy = PRIVY_APP_ID.length > 0 && PRIVY_APP_ID !== 'your-privy-app-id';

/**
 * Privy login methods we surface in the UI. We pass these to `login({ loginMethods })`
 * to scope the modal to a single method — gives users a one-click flow per channel
 * instead of a generic "Continue" button that opens a modal of options.
 */
export type LoginMethod = 'email' | 'google' | 'twitter' | 'wallet';

/**
 * Unified auth hook — combines Privy session state with our DB user record.
 *
 * - `isReady` flips true once Privy has finished initialising. Always wait for this
 *   before rendering auth-gated UI or running redirects.
 * - `user` is the Forj DB user (auto-provisioned on first API call).
 * - `needsOnboarding` is true once authenticated and DB user exists but hasn't
 *   completed onboarding.
 *
 * The query retries up to 3 times with exponential backoff to handle JIT
 * provisioning race conditions on very first login.
 *
 * **Identity change detection**: when the Privy user id changes (logout +
 * different account login, account switch from the embedded wallet, etc) we
 * clear the React Query cache so we don't serve the previous user's data.
 * Without this, `staleTime: Infinity` on `user.me` would keep returning the
 * old account until a hard refresh.
 */
export function useAuth() {
  const privy = usePrivy();
  // useLogin lets us pass per-call options (loginMethods, disableSignup, prefill)
  // so the LoginCard can deep-link straight into a specific provider's flow.
  //
  // The `onError` handler converts Privy's terse error codes into UX-friendly
  // toasts. Without it, a wallet-connection failure (MetaMask not installed,
  // user-rejected, wrong-chain) silently closes the modal with no feedback —
  // looks broken even when it isn't.
  const { login: privyLogin } = useLogin({
    onError: (errorCode) => {
      logger.warn('privy/login', `code=${errorCode}`);
      const msg = humanizeLoginError(errorCode);
      if (msg) toast.error(msg);
    },
  });
  const queryClient = useQueryClient();
  const enabled = privy.ready && privy.authenticated;

  const userQuery = api.user.me.useQuery(undefined, {
    enabled,
    // The current user record changes only on explicit mutations (onboarding,
    // settings save) — those mutations invalidate the cache. Treating it as
    // permanently fresh keeps every dashboard page navigation instant.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // JIT provisioning can take a beat on first login — give it 3 chances,
    // but cap delay so a failed network doesn't lock the UI for 10s.
    retry: 3,
    retryDelay: (attempt) => Math.min(800 * Math.pow(2, attempt - 1), 3000),
  });

  // Track the Privy DID across renders. When it changes from one identity
  // to another (or to/from null), we wipe ALL cached queries — not just
  // user.me — because we don't want the previous user's proposals, jobs,
  // contracts, messages, or notifications leaking into the new session.
  const lastPrivyUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!privy.ready) return;
    const currentId = privy.authenticated ? privy.user?.id ?? null : null;
    const previousId = lastPrivyUserId.current;

    // First run after Privy hydrates — record the id but don't clear; the cache
    // is already empty on first paint and clearing it would cancel the initial
    // user.me fetch.
    if (previousId === undefined) {
      lastPrivyUserId.current = currentId;
      return;
    }

    if (previousId !== currentId) {
      // Identity changed — different user, or logged out, or just logged in.
      // Nuking the cache is the only safe move; targeted invalidation would
      // miss any router/page that holds its own queries.
      queryClient.clear();
      lastPrivyUserId.current = currentId;
    }
  }, [privy.ready, privy.authenticated, privy.user?.id, queryClient]);

  // Wrap logout to also clear the cache up-front. The effect above will catch
  // it via the privy.user.id transition, but doing it here too means the UI
  // never has a chance to flash the old user's data between logout and the
  // next render.
  const logout = useCallback(async () => {
    try {
      await privy.logout();
    } finally {
      queryClient.clear();
    }
  }, [privy, queryClient]);

  return {
    isReady: privy.ready,
    isAuthenticated: privy.authenticated,
    isLoading: !privy.ready || (enabled && userQuery.isPending),
    privyUser: privy.user,
    user: userQuery.data ?? null,
    needsOnboarding: Boolean(userQuery.data && !userQuery.data.isOnboarded),
    /** Open the Privy login modal. Pass options to scope methods or block signup. */
    login: privyLogin,
    /**
     * Convenience: open the modal pre-filtered to a single method. Useful for
     * dedicated "Sign in with X" buttons that should not show the full picker.
     */
    loginWith: (method: LoginMethod) => privyLogin({ loginMethods: [method] }),
    logout,
    refetchUser: userQuery.refetch,
  };
}

/**
 * Map Privy's terse error codes / messages into something a user can act on.
 * Returns `null` for codes we want to silently ignore (e.g. user-cancelled).
 *
 * Privy's `onError` arg can be either a string code or an Error; we normalise
 * to a string for matching.
 */
function humanizeLoginError(err: unknown): string | null {
  const code = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
  const c = code.toLowerCase();

  // User dismissed / cancelled — never show an error toast for this.
  if (c.includes('exited') || c.includes('user_rejected') || c.includes('cancel')) {
    return null;
  }
  if (c.includes('wallet_not_found') || c.includes('no provider') || c.includes('no wallet')) {
    return 'No wallet detected. Install MetaMask or another browser wallet, then try again.';
  }
  if (c.includes('wrong_network') || c.includes('chain')) {
    return 'Wrong network. Switch your wallet to Base (or Base Sepolia for testnet) and retry.';
  }
  if (c.includes('rate') || c.includes('too_many')) {
    return 'Too many sign-in attempts. Wait a minute and try again.';
  }
  if (c.includes('connect') || c.includes('connection')) {
    return "Couldn't connect to wallet. Unlock the extension or try a different sign-in method.";
  }
  // Default: show something rather than nothing so the user knows the
  // attempt failed.
  return 'Sign-in failed. Try a different method or refresh the page.';
}
