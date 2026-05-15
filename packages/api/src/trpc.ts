import { TRPCError, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Public procedure — no auth required.
 */
export const publicProcedure = t.procedure;

/**
 * Auth middleware — requires valid user in context.
 */
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You must be logged in' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

/**
 * @deprecated Role gating has been removed — every authenticated user can
 *   both post jobs and submit proposals. The schema still has a `role`
 *   column (`client | freelancer | both`) as a UX hint (default dashboard
 *   tab, profile labelling), but it no longer restricts which procedures
 *   a user can call.
 *
 *   These aliases exist so callsites that still import them keep working
 *   without a forced refactor. New code should use `protectedProcedure`.
 *
 *   Why dropped:
 *     - `both` was a confusing third option in onboarding.
 *     - Role-based gating prevented users from organically switching
 *       between sides (a freelancer who finishes a project and decides
 *       to hire someone shouldn't have to flip a setting first).
 *     - Activity is the real signal — we derive the public profile label
 *       from "has posted N jobs" / "has completed N contracts".
 */
export const clientProcedure = protectedProcedure;
export const freelancerProcedure = protectedProcedure;

/**
 * Admin-only procedure — for the dispute arbiter dashboard, audit tools, etc.
 *
 * Auth model is **defense in depth**:
 *   - On-chain: smart contract `onlyOwner` modifier already gates the actual
 *     `resolveDispute` execution. A non-arbiter wallet can't move funds even
 *     if they bypass the API layer.
 *   - Off-chain: this middleware additionally hides the *list* of disputed
 *     contracts from non-admins. Without it, any authenticated user could
 *     query `admin.listDisputed` and see private contract details for cases
 *     they aren't party to.
 *
 * Allowlist source: env var `ADMIN_USER_IDS` (comma-separated DB user IDs).
 * Empty / missing means **no one** is admin (fail closed) — this is correct
 * behaviour for an MVP that hasn't designated an arbiter yet.
 *
 *   ADMIN_USER_IDS=uuid-a,uuid-b,uuid-c
 */
const adminIds = (): Set<string> => {
  const raw = process.env.ADMIN_USER_IDS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
};

const enforceAdmin = enforceUserIsAuthed.unstable_pipe(({ ctx, next }) => {
  const allowed = adminIds();
  if (!allowed.has(ctx.user.id)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const adminProcedure = t.procedure.use(enforceAdmin);
