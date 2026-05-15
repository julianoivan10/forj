import 'server-only';
import { appRouter, createCaller, createTRPCContext } from '@forj/api';
import { cookies, headers } from 'next/headers';
import { getUserFromToken } from '../privy/server';

export async function createServerCaller() {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const token = cookieStore.get('privy-token')?.value ?? cookieStore.get('privy-id-token')?.value;

  const user = await getUserFromToken(token);
  const ctx = await createTRPCContext({
    headers: new Headers(headerStore),
    user,
  });
  return createCaller(ctx);
}

export { appRouter };
export type { AppRouter } from '@forj/api';
