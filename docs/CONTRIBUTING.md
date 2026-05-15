# Forj — Contributing Guide

> Conventions, dev workflow, and "how to add X" recipes. Read once
> before your first PR, refer back as needed.

---

## 1. Local dev environment

### Prereqs

| Tool | Version | Check |
|---|---|---|
| Node.js | ≥ 20.10 | `node -v` |
| pnpm | ≥ 9.0 | `pnpm -v` |
| Git | any recent | `git --version` |

Recommended editor: VS Code with the official Solidity + ESLint + Prettier
extensions. Tailwind IntelliSense is configured to recognise our shared
theme via `apps/web/tailwind.config.ts`.

### First-time setup

```bash
git clone <repo-url> forj
cd forj
pnpm install
cp .env.example .env
# Fill in env vars — see docs/SETUP.md for which ones to fill first
pnpm --filter @forj/db push
pnpm --filter @forj/contracts compile
pnpm --filter @forj/contracts build
pnpm --filter @forj/web dev
```

### Daily workflow

```bash
# Run all packages in parallel dev mode (rare — usually only web is needed)
pnpm dev

# Just the web app
pnpm --filter @forj/web dev

# Type-check everything before pushing
pnpm typecheck

# Lint
pnpm lint
```

---

## 2. Code conventions

### General

- **TypeScript everywhere.** No `any` without a `// reason: …` comment.
- **`strict: true`** is non-negotiable. Use type guards, not assertions.
- **Comments explain "why"**, not "what". If the next dev reads the code
  and asks "why is this here?", that's where a comment goes. If they
  ask "what does this line do?", the line is too clever — simplify it.
- **No emoji in source files** unless rendering them as user content.

### Naming

- **Files**: `kebab-case.ts` (`use-fund-escrow.ts`, `job-card.tsx`).
- **Components**: `PascalCase` exported, file matches the main component's
  kebab-cased name.
- **Hooks**: `useThing()` prefix, file: `use-thing.ts`.
- **Constants**: `SCREAMING_SNAKE_CASE` at module top, `camelCase` inside
  functions.
- **Types**: prefer `interface` for public surfaces (auto-merging is a
  feature), `type` for unions / mapped types.

### Imports

Order: external → workspace → relative.

```ts
import { useState } from 'react';           // external
import { z } from 'zod';
import { db, users } from '@forj/db';        // workspace
import { Button } from '@/components/ui';    // alias (apps/web)
import { localHelper } from './helpers';     // relative
```

Use `@/*` path aliases in `apps/web`. Don't reach across packages with
relative paths — go through the barrel.

### Comments

Block comments at the top of a function/module explain intent + design
trade-offs. Inline comments call out non-obvious behaviour.

```ts
/**
 * Resolves the canonical wallet for a Privy user.
 *
 * Smart wallet beats embedded EOA beats linked external wallet — this
 * order matters because the on-chain identity must match what the
 * frontend exposes via `useAccount()` (which returns the smart wallet
 * when SmartWalletsProvider is mounted).
 */
function pickCanonicalWallet(privyUser: unknown): string | null { ... }
```

### React patterns

- `'use client'` directives only where genuinely needed. Default to RSC.
- State stays as close to its consumer as possible. Lift only when two
  components need it.
- Side effects (`useEffect`) need a comment explaining the dependency
  rationale. If you find yourself fighting the lint rule, redesign — you
  probably want a `useMemo` or a derived value.
- Prefer composition over props explosion. A `<Card>` that takes 15
  props should be 3 sub-components.

### Tailwind

- Use the shared CSS variables (`var(--color-text-primary)`) instead of
  hardcoded hex. The theme.css file is the single source of truth.
- **Never** use `bg-white/[N]` or `bg-black/[N]` — they break light mode.
  Use `bg-[var(--color-text-primary)]/[N]` for theme-aware tints.
- Keep utility chains under ~12 classes per element. Past that, extract
  a component or compose with `cn(baseClasses, conditional)`.

---

## 3. Adding a feature — recipes

### Recipe A: New tRPC procedure

1. Pick the right router file in `packages/api/src/routers/`. Create a
   new router only when the surface is genuinely new (e.g.
   `saved-job.ts` was a new feature).
2. Add the Zod input schema.
3. Implement the handler — guards first (auth, ownership), business
   logic, return the result.
4. If new: mount in `packages/api/src/root.ts`.
5. Typecheck the API package: `pnpm --filter @forj/api typecheck`.
6. Use from the client: `api.thing.method.useQuery(...)`.

### Recipe B: New DB table

1. Create `packages/db/src/schema/your-table.ts` — define the table,
   primary key, indexes, FKs.
2. Export from `packages/db/src/schema/index.ts`.
3. Apply to the database:
   - **Dev / quick iteration**: write a `one-off-add-yourthing.ts` script
     using `@neondatabase/serverless` to run the SQL directly. Delete
     the file after running once.
   - **Better**: `pnpm --filter @forj/db push` (answer "Yes" to the
     interactive prompt).
4. Typecheck: `pnpm --filter @forj/db typecheck`.

Why one-off scripts: drizzle-kit's interactive prompt is hard to
auto-accept in scripts. For one-shot schema changes in dev, a direct
SQL execution is faster.

### Recipe C: New UI component

1. Decide: does it live in `apps/web/components/ui/` (truly generic) or
   in a feature-scoped folder (`components/jobs/`, `components/contracts/`)?
2. Create the file with a single default-styled variant.
3. If reusable: export from `components/ui/index.ts` barrel.
4. Add a block comment explaining the design intent — what's the
   problem this component solves that a plain `<div>` doesn't?
5. Wire into the consuming page.

### Recipe D: New smart contract function

1. Edit `packages/contracts/contracts/ForjEscrow.sol`. Follow the
   existing style — `nonReentrant`, error types, events.
2. Compile: `pnpm --filter @forj/contracts compile`.
3. Update the hand-curated ABI in `packages/contracts/src/forj-escrow-abi.ts`.
4. Build the package: `pnpm --filter @forj/contracts build`.
5. Write a test in `packages/contracts/test/` (Hardhat + chai matchers).
6. **Redeploy** to Base Sepolia: `pnpm --filter @forj/contracts hardhat run scripts/deploy-forj.ts --network baseSepolia`.
7. Update `addresses.ts` + `.env` + Pimlico whitelist.
8. Verify: `pnpm --filter @forj/contracts hardhat verify --network baseSepolia <addr> <args>`.

### Recipe E: New empty state variant

1. Add the variant to `EmptyVariant` union in `apps/web/components/ui/empty-state.tsx`.
2. Add a case to `variantShapes()` — use only the three Bauhaus
   primitives (rect / circle / triangle) and the brand triad colours.
3. Apply it: `<EmptyState variant="your-variant" title="..." />`.

---

## 4. Git workflow

- Branch off `main` for any non-trivial change.
- Branch naming: `feat/X`, `fix/X`, `chore/X`, `docs/X`.
- Commit messages: imperative ("Add bookmark feature", not "Added").
- Squash small WIP commits before merging. Keep the merged history
  readable.
- Don't push directly to `main` once a CI pipeline is set up (Phase 9).

### Commit hygiene

- One concern per commit. "Refactor X" + "Add Y" should be two commits.
- Run `pnpm typecheck` before pushing — failing CI on type errors is
  embarrassing.

---

## 5. When something breaks

### "Cannot find module '@forj/X'"

You probably renamed a workspace package without running
`pnpm install` afterwards. Run it from the repo root.

### "Cannot convert undefined to a BigInt"

A constant you imported wasn't yet present in the package's `dist/`
build. Run `pnpm --filter @forj/<pkg> build`, restart the dev server.

### "column X does not exist"

The schema changed but `db push` wasn't run. Either run it
interactively, or write a one-off script (Recipe B).

### Build error on globals.css `Can't resolve '@forj/tailwind-config'`

Same as the first — restart dev server after `pnpm install` so Next
picks up the renamed workspace.

### Hardhat verify fails with "constructor args do not match"

The constructor args you pass to `hardhat verify` must match exactly
what was used at deploy time. Re-derive them from `deploy-forj.ts` —
they're printed in the deploy log.

### Privy modal won't open

Check `NEXT_PUBLIC_PRIVY_APP_ID` is set + your app's allowed origins
in the Privy dashboard include `http://localhost:3000`.

### Pimlico paymaster rejects user-op

The escrow + USDC addresses must be on Pimlico's sponsorship policy
allowed-contracts list. Add them at https://dashboard.pimlico.io.

---

## 6. Pull request checklist

Before requesting review, run through:

- [ ] `pnpm typecheck` — all packages green
- [ ] `pnpm lint` — no new errors
- [ ] Manual test: ran through the relevant section of `docs/TESTING.md`
- [ ] Updated docs if the API or behaviour changed
- [ ] Added a comment explaining any non-obvious design decision
- [ ] No `console.log` left in source (use `logger.*` from `@/lib/logger`)
- [ ] No new dependencies without a quick justification in the PR description
- [ ] If touching the smart contract: redeployed to Sepolia and updated `addresses.ts`

---

## 7. Things to NOT do

- **Don't** add a new dependency for a 10-line utility. Write the 10 lines.
- **Don't** import from `node_modules` paths directly. Use the public API.
- **Don't** persist state in cookies that the server can't read.
- **Don't** trust client-supplied data on chain — always verify the
  on-chain event server-side before flipping a DB row.
- **Don't** push to `main` if `pnpm typecheck` fails. Ever.
- **Don't** add emojis to source files unless rendering as user content.
- **Don't** create a new top-level folder without flagging it in PR
  review. The monorepo layout is intentional.

---

## 8. Useful one-liners

```bash
# Reset the dev DB schema from clean
pnpm --filter @forj/db push --force

# Re-run failing typecheck only (turbo cache aware)
pnpm typecheck --filter='[HEAD]'

# Open Drizzle Studio (DB UI in the browser)
pnpm --filter @forj/db studio

# Compile + verify smart contract in one go (after redeploy)
pnpm --filter @forj/contracts compile && pnpm --filter @forj/contracts hardhat verify --network baseSepolia <addr> <args>

# Tail logs in the dev server
pnpm --filter @forj/web dev | tee dev.log
```

---

## 9. Who owns what

For now, single-maintainer. Future:

- **Smart contracts**: requires reviewer with Solidity experience.
- **DB schema changes**: requires consideration for migration strategy
  (we don't have a migration framework yet — be careful).
- **API surface changes**: requires updating both frontend consumers
  and `docs/ARCHITECTURE.md`.
- **Visual identity**: brand owner sign-off (currently the project lead).
