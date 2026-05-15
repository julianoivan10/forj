/**
 * Tiny client-side logger. Goals:
 *
 *  - In **development**: route through `console.*` so the browser DevTools
 *    show useful debug output during local work.
 *  - In **production**: silent by default for `info` / `debug`; `warn` and
 *    `error` still go to the console (browser users may need them, and it
 *    matches the policy of `next.config.ts` `compiler.removeConsole`).
 *
 * If we ever wire a remote sink (Sentry, LogRocket, Datadog), it lands in
 * one place — the `error` and `warn` methods — without touching every
 * caller.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('foo');             // dev only
 *   logger.warn('careful', err);    // dev + prod
 *   logger.error('boom', err);      // dev + prod (and remote sink later)
 */

const isProd = process.env.NODE_ENV === 'production';

function format(scope: string, msg: string) {
  return `[${scope}] ${msg}`;
}

export const logger = {
  /** Verbose tracing — local dev only. */
  debug(scope: string, msg: string, ...rest: unknown[]) {
    if (isProd) return;
    console.debug(format(scope, msg), ...rest);
  },
  /** Useful-but-not-critical info — local dev only. */
  info(scope: string, msg: string, ...rest: unknown[]) {
    if (isProd) return;
    console.info(format(scope, msg), ...rest);
  },
  /** Something unusual; surfaces in prod consoles too. */
  warn(scope: string, msg: string, ...rest: unknown[]) {
    console.warn(format(scope, msg), ...rest);
  },
  /** A user-visible failure. Always logged; remote sink later. */
  error(scope: string, msg: string, ...rest: unknown[]) {
    console.error(format(scope, msg), ...rest);
    // Hook for Sentry / Datadog / etc. Intentionally TODO — wire when a sink
    // is selected so we don't bake in a vendor decision.
  },
};
