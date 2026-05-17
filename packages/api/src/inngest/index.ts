import { dispatchEmailFn } from './functions/dispatch-email';

export { inngest } from './client';
export type { ForjEventName, ForjEvents } from './client';

/**
 * Full list of Inngest functions registered with this app. The
 * Next.js route at `apps/web/app/api/inngest/route.ts` passes this
 * array to `serve()` so Inngest's discovery endpoint can find and
 * invoke them.
 *
 * Adding a new function: drop it in `./functions/`, then push the
 * export into this array. No other wiring needed.
 */
export const inngestFunctions = [dispatchEmailFn];
