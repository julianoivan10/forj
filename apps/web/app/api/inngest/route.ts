import { inngest, inngestFunctions } from '@forj/api';
import { serve } from 'inngest/next';

/**
 * Inngest endpoint. Inngest's worker calls this URL to:
 *   - Discover the function set (GET — returns metadata).
 *   - Invoke a single function with an event payload (POST — runs
 *     the function and reports the result, including step retries).
 *
 * Local dev: run `pnpm dlx inngest-cli@latest dev` alongside
 * `pnpm dev`. The CLI auto-detects this endpoint and registers the
 * functions. Without the CLI, events sent via `inngest.send()`
 * queue locally but don't dispatch.
 *
 * Production: Inngest cloud pings this URL after each deploy to
 * pick up new function definitions. `INNGEST_SIGNING_KEY` (env)
 * verifies that incoming POSTs are actually from Inngest — `serve`
 * checks this automatically.
 */
const handler = serve({
  client: inngest,
  functions: inngestFunctions,
});

export { handler as GET, handler as POST, handler as PUT };
