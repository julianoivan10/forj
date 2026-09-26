import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import ws from 'ws';
import { isPlainPostgres } from './connection';
import * as schema from './schema';

/**
 * Neon WebSocket pool + Drizzle.
 *
 * Why neon-serverless (not neon-http):
 *   `drizzle-orm/neon-http` is wire-cheap (no connection pool, no
 *   keep-alive) but it speaks the Neon HTTP query API, which can
 *   ONLY run one statement per request. That made multi-statement
 *   logic (`db.transaction(async tx => { ... })`) impossible — every
 *   "needs to be atomic" branch in our tRPC routers had to fall back
 *   to "best-effort rollback on failure" which leaves the database
 *   in an awkward state when the rollback itself fails.
 *
 *   `drizzle-orm/neon-serverless` uses a WebSocket pool against
 *   Neon's pg-protocol endpoint. Real transactions, real LISTEN /
 *   NOTIFY, full pg compat. Slightly higher latency on cold start
 *   (one extra WebSocket handshake), but that's amortised across
 *   the function's lifetime.
 *
 * Why we pass `ws` explicitly:
 *   Node ≥ 22.4 ships a global `WebSocket`, but our `engines` field
 *   accepts Node ≥ 20 (no global). The driver checks
 *   `neonConfig.webSocketConstructor` first; setting it explicitly
 *   means the driver doesn't care about runtime version.
 *
 *   In edge runtimes (Vercel Edge / Cloudflare Workers) `WebSocket`
 *   is already global, so this `ws` import is dead weight there.
 *   Acceptable — we're not on the edge yet, and tree-shaking will
 *   drop it once we are.
 *
 * Connection-string choice:
 *   Use the POOLED `DATABASE_URL` (Neon's pgBouncer endpoint). The
 *   WebSocket Pool layered on top reuses connections across
 *   requests in the same lambda invocation. UNPOOLED is only needed
 *   for migrations + Drizzle Studio (long-lived sessions).
 */
neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const options = {
  schema,
  casing: 'snake_case' as const,
  logger: process.env.NODE_ENV === 'development',
};

function createNeonDb(url: string) {
  return drizzle(new Pool({ connectionString: url }), options);
}

/**
 * Plain Postgres (local Docker, CI) speaks the normal wire protocol, which
 * the Neon WebSocket driver can't reach. Those hosts use node-postgres.
 * Both drivers expose the same Drizzle Postgres API, so the rest of the
 * codebase is typed against the Neon one.
 */
function createNodePgDb(url: string): ReturnType<typeof createNeonDb> {
  return drizzlePg(new pg.Pool({ connectionString: url }), options) as unknown as ReturnType<
    typeof createNeonDb
  >;
}

export const db = isPlainPostgres(databaseUrl)
  ? createNodePgDb(databaseUrl)
  : createNeonDb(databaseUrl);

export type Database = typeof db;
