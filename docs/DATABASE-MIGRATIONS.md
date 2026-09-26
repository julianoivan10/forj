# Database migrations

Schema: `packages/db/src/schema/*.ts` (Drizzle). Migrations: `packages/db/drizzle/` (**committed**).
Runner: `packages/db/src/migrate.ts`.

`db:push` is for throwaway local databases only. Every schema change that reaches staging or
production goes through a generated, reviewed, versioned migration.

## Commands

```bash
pnpm --filter @forj/db generate --name <change>   # write drizzle/NNNN_<change>.sql from the schema diff
pnpm --filter @forj/db migrate:status             # read-only: applied vs pending
pnpm --filter @forj/db migrate:apply [--yes]      # apply pending migrations
pnpm --filter @forj/db migrate baseline [--yes]   # one-time: adopt migrations on a db:push-built DB
```

The runner uses `DATABASE_URL_UNPOOLED` when set (migrations need a session), otherwise `DATABASE_URL`.

## Safety rules (enforced by the runner)

- A non-local database needs `--yes` for `apply` and `baseline`; `status` never writes.
- A pending migration containing destructive SQL (`DROP`, `TRUNCATE`, `DELETE FROM`, column type
  changes, renames) is refused unless `ALLOW_DESTRUCTIVE_MIGRATION=<exact migration tag>`. Take a
  Neon branch or backup first.
- `apply` refuses a database that has tables but no migration history, and tells you to baseline.
- `baseline` only records `0000_baseline` as applied, and only if the core tables exist and nothing
  is recorded yet. It never creates or alters tables.

## Current migrations

| Tag | What | Destructive |
|---|---|---|
| `0000_baseline` | The schema as it existed before migrations (built with `db:push`) | no |
| `0001_escrow_v3_sync` | Escrow V3 sync: enums, `escrow_transactions`, `escrow_events`, `indexer_cursors`, new `contracts` columns, unique escrow-link indexes | no (additive; existing rows default to `escrow_version = 'v2'`) |

`0001` adds a unique index on `(escrow_contract_address, on_chain_contract_id)`. If an old
replay bug linked one escrow to two rows, the migration fails and rolls back. Check first:

```sql
select escrow_contract_address, on_chain_contract_id, count(*)
from contracts where on_chain_contract_id is not null
group by 1, 2 having count(*) > 1;
```

## Adopting migrations on the existing database (one time)

The current Neon database was built with `db:push`. `migrate:status` against it shows both
migrations pending. That was checked read-only; nothing was applied.

1. Create a Neon branch (backup) of production.
2. Point `DATABASE_URL_UNPOOLED` at the **branch**, run `migrate:status`, `migrate baseline --yes`,
   `migrate:apply --yes`, and smoke-test the app against the branch.
3. Run the duplicate-link query above on production.
4. Repeat step 2 against production during a deploy window, before deploying the app version that
   reads the new columns.

## Workflow per environment

| Environment | Database | How schema changes land |
|---|---|---|
| Local | Docker Postgres or a personal Neon branch | `generate`, then `migrate:apply` (or `push` on a scratch DB) |
| CI / E2E | Disposable Docker Postgres | `migrate:apply` from empty. Tested: fresh, baselined push-DB with data, remote-guard refusal |
| Staging (Preview) | Neon branch | `migrate:apply --yes` in the deploy job before the app starts |
| Production | Neon main | Reviewed migration PR, backup branch, `migrate:status`, `migrate:apply --yes`, then app deploy |

Migrations must stay backward compatible for one app version (add, then use, then remove later),
because Vercel may briefly serve old and new code at the same time.
