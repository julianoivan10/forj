import { appRouter, createTRPCContext, log } from '@forj/api';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getUserFromToken } from '@/lib/privy/server';

/**
 * Extract Privy auth token from the request.
 * Priority: Authorization header → privy-token cookie → privy-id-token cookie
 */
async function extractToken(req: NextRequest): Promise<string | undefined> {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // 2. Cookies
  const cookieStore = await cookies();
  return (
    cookieStore.get('privy-token')?.value ??
    cookieStore.get('privy-id-token')?.value ??
    undefined
  );
}

const handler = async (req: NextRequest) => {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async () => {
      const token = await extractToken(req);
      const user = await getUserFromToken(token);
      return createTRPCContext({
        headers: req.headers,
        user,
      });
    },
    onError({ path, error }) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[tRPC] ${path ?? '<no-path>'}: ${error.message}`);
        return;
      }
      // Production: unexpected failures only (not validation/auth 4xx), and
      // never the input, which can contain personal data.
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        log('error', 'trpc.internal_error', { path, message: error.message, cause: error.cause });
      }
    },
  });
};

export { handler as GET, handler as POST };
