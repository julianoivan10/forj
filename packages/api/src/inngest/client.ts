import { Inngest } from 'inngest';

/**
 * Inngest client — handles async + retried background work.
 *
 * Why we use Inngest:
 *   `notify()` writes an in-app notification row synchronously (cheap,
 *   needs to be instant for the bell badge) AND fires off an email
 *   via Resend (slow, sometimes flaky, retriable). Doing the email
 *   inline in the tRPC handler means:
 *     - The whole request is blocked on Resend's RTT.
 *     - A Resend hiccup that takes >10s burns the serverless lambda
 *       budget.
 *     - Failures are silent — `dispatchEmail` swallows errors so the
 *       caller's mutation doesn't fail, but there's no retry, no
 *       observability.
 *
 *   With Inngest, `notify()` instead fires an event
 *   (`notification/dispatch-email`). Inngest acks the event in <50ms,
 *   then invokes the handler in the background with exponential
 *   retries on failure. The mutation returns fast, the email lands
 *   eventually, and we get a UI in the Inngest dashboard to watch
 *   delivery health.
 *
 * Local dev:
 *   Run `pnpm dlx inngest-cli@latest dev` alongside `pnpm dev`. The
 *   CLI auto-discovers the `/api/inngest` endpoint and processes
 *   events locally — no production Inngest account needed.
 *   Without the CLI running, events still land in the local queue
 *   but won't dispatch until the CLI is up.
 *
 * Production:
 *   Set `INNGEST_EVENT_KEY` (send keys) and `INNGEST_SIGNING_KEY`
 *   (verify webhook signatures) — both already documented in
 *   `.env.example`. The function set is registered when Vercel
 *   redeploys; Inngest pings `/api/inngest` to discover functions.
 */
export const inngest = new Inngest({
  id: 'forj',
  // Schema-by-convention. Event names are dot-namespaced under the
  // domain ('notification/...', 'contract/...', etc.) so they're
  // searchable in the Inngest dashboard.
});

/**
 * Strongly-typed event names + payloads. Inngest's send() signature
 * accepts string event names, but we wrap it so typos in callers
 * fail to compile. Add a new entry here whenever you introduce a
 * new background job.
 */
export type ForjEvents = {
  'notification/dispatch-email': {
    data: {
      userId: string;
      type: string;
      title: string;
      body: string | null;
      metadata: Record<string, unknown> | null;
    };
  };
};

export type ForjEventName = keyof ForjEvents;
