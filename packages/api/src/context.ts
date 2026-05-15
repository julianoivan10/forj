import { db } from '@forj/db';
import type { User } from '@forj/db';

export interface CreateContextOptions {
  headers: Headers;
  user: User | null;
}

export async function createTRPCContext(opts: CreateContextOptions) {
  return {
    db,
    user: opts.user,
    headers: opts.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
