/**
 * Versioned migrations for @forj/db.
 *
 *   pnpm --filter @forj/db migrate status           read-only: applied vs pending
 *   pnpm --filter @forj/db migrate apply [--yes]    apply pending migrations
 *   pnpm --filter @forj/db migrate baseline [--yes] adopt migrations on a DB built with `db:push`
 *
 * Safety rules:
 *   - Any non-local database requires `--yes` for apply/baseline.
 *   - A pending migration containing destructive SQL (DROP, TRUNCATE,
 *     DELETE FROM, column type changes, renames) is refused unless
 *     ALLOW_DESTRUCTIVE_MIGRATION names that migration's tag exactly.
 *   - `baseline` only marks 0000 as applied, and only when the schema's
 *     core tables already exist and no migration has been recorded yet.
 *     It never creates or alters tables.
 *
 * Uses DATABASE_URL_UNPOOLED when set (migrations need a session), else
 * DATABASE_URL. Loads the monorepo root `.env` for local runs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import ws from 'ws';
import { isPlainPostgres } from './connection';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));
const DESTRUCTIVE =
  /\b(DROP\s+(TABLE|COLUMN|TYPE|SCHEMA|INDEX|CONSTRAINT)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE|RENAME\s+(TO|COLUMN))\b/i;

type Journal = { entries: Array<{ idx: number; tag: string; when: number }> };

function journal(): Journal {
  return JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, 'utf8')) as Journal;
}

interface Target {
  plain: boolean;
  host: string;
  query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

function connect(url: string): Target {
  const host = new URL(url).hostname;
  if (isPlainPostgres(url)) {
    const pool = new pg.Pool({ connectionString: url });
    const db = drizzlePg(pool);
    return {
      plain: true,
      host,
      query: async (sql, params) => (await pool.query(sql, params)).rows,
      migrate: () => migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      close: () => pool.end(),
    };
  }
  neonConfig.webSocketConstructor = ws;
  const pool = new NeonPool({ connectionString: url });
  const db = drizzleNeon(pool);
  return {
    plain: false,
    host,
    query: async (sql, params) => (await pool.query(sql, params)).rows as Array<Record<string, unknown>>,
    migrate: () => migrateNeon(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => pool.end(),
  };
}

async function appliedHashes(t: Target): Promise<Set<string>> {
  const exists = await t.query(
    `select 1 from information_schema.tables where table_schema = 'drizzle' and table_name = '__drizzle_migrations'`,
  );
  if (exists.length === 0) return new Set();
  const rows = await t.query(`select hash from drizzle.__drizzle_migrations`);
  return new Set(rows.map((r) => String(r.hash)));
}

async function pending(t: Target) {
  const files = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const applied = await appliedHashes(t);
  const entries = journal().entries;
  return files.map((f, i) => ({
    tag: entries[i]!.tag,
    hash: f.hash,
    when: f.folderMillis,
    sql: f.sql.join('\n'),
    applied: applied.has(f.hash),
  }));
}

async function status(t: Target) {
  const list = await pending(t);
  console.warn(`Database host: ${t.host}${t.plain ? ' (plain postgres)' : ' (neon)'}`);
  for (const m of list) console.warn(`  ${m.applied ? '[applied]' : '[pending]'} ${m.tag}`);
  const count = list.filter((m) => !m.applied).length;
  console.warn(count === 0 ? 'Up to date.' : `${count} pending migration(s).`);
  return list;
}

function requireYes(t: Target, action: string) {
  if (t.plain || process.argv.includes('--yes')) return;
  throw new Error(`Refusing to ${action} on remote database ${t.host} without --yes.`);
}

async function apply(t: Target) {
  requireYes(t, 'apply migrations');
  const list = await status(t);
  for (const m of list.filter((x) => !x.applied)) {
    if (DESTRUCTIVE.test(m.sql) && process.env.ALLOW_DESTRUCTIVE_MIGRATION !== m.tag) {
      throw new Error(
        `Migration ${m.tag} contains destructive SQL. Review it, back up the database, then re-run with ALLOW_DESTRUCTIVE_MIGRATION=${m.tag}.`,
      );
    }
  }
  const core = await t.query(`select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users'`);
  const applied = list.filter((m) => m.applied).length;
  if (core.length > 0 && applied === 0) {
    throw new Error(
      'Tables already exist but no migration is recorded (database was built with db:push). Run `migrate baseline` first.',
    );
  }
  await t.migrate();
  console.warn('Migrations applied.');
  await status(t);
}

async function baseline(t: Target) {
  requireYes(t, 'baseline');
  const list = await pending(t);
  const first = list[0];
  if (!first) throw new Error('No migrations found.');
  if (list.some((m) => m.applied)) throw new Error('Migrations are already recorded; baseline is not needed.');
  const core = await t.query(`select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users'`);
  if (core.length === 0) throw new Error('Schema is empty. Use `migrate apply` instead of baseline.');
  await t.query(`create schema if not exists drizzle`);
  await t.query(
    `create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
  );
  await t.query(`insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`, [first.hash, first.when]);
  console.warn(`Recorded ${first.tag} as applied. Run \`migrate apply\` next.`);
  await status(t);
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or DATABASE_URL_UNPOOLED must be set');
  const command = process.argv[2] ?? 'status';
  const t = connect(url);
  try {
    if (command === 'status') await status(t);
    else if (command === 'apply') await apply(t);
    else if (command === 'baseline') await baseline(t);
    else throw new Error(`Unknown command "${command}". Use status | apply | baseline.`);
  } finally {
    await t.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
