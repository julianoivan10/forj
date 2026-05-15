'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';
import { api } from './client';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return 'http://localhost:3000';
}

/**
 * Try to read the Privy auth token from the cookie.
 * This is used as a fallback mechanism in the Authorization header
 * to ensure the tRPC server can always authenticate the request.
 */
function getPrivyToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('privy-token='));
  return match?.split('=')[1];
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cached responses are considered fresh for 60s — page navigations
            // within that window resolve instantly from cache instead of
            // re-fetching, which is the biggest perceived-perf win we can make.
            staleTime: 60_000,
            // Keep queries in cache for 5 min after they go inactive, so going
            // back to a previous page is also instant.
            gcTime: 5 * 60_000,
            // Don't refire every poll when the tab is backgrounded — save CPU
            // & battery, and avoid waking up the API for nothing.
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: false,
            // Single retry is enough; the loud-failure UX is better than
            // silently re-trying for ~12s.
            retry: 1,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          // Log only failed responses (errors) — we don't need to see every
          // successful query in the console. UNAUTHORIZED errors during the
          // brief window before Privy hydrates are filtered out so they
          // don't pollute the console either.
          enabled: (op) => {
            if (op.direction !== 'down') return false;
            if (!(op.result instanceof Error)) return false;
            // Suppress the expected pre-auth 401s. The query will retry
            // automatically once `enabled` flips true.
            const msg = (op.result as Error & { data?: { code?: string } }).data?.code;
            if (msg === 'UNAUTHORIZED') return false;
            return true;
          },
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          async headers() {
            const headers: Record<string, string> = {
              'x-trpc-source': 'web',
            };
            // Forward Privy token so server can authenticate even
            // without cookie access (certain browser configs, etc.)
            const token = getPrivyToken();
            if (token) {
              headers['authorization'] = `Bearer ${token}`;
            }
            return headers;
          },
        }),
      ],
    }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
