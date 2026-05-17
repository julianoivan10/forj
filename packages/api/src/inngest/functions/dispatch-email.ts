import { dispatchEmail } from '../../services/email-dispatch';
import { inngest } from '../client';

// Notification types email-dispatch knows how to route. Kept loose
// (string) at the Inngest boundary — the dispatcher itself validates
// and silently no-ops on unknown types.
const KNOWN_TYPES = new Set([
  'proposal_received',
  'proposal_accepted',
  'proposal_rejected',
  'job_awarded',
  'message_received',
  'contract_funded',
  'contract_submitted',
  'contract_revision_requested',
  'contract_completed',
  'contract_disputed',
  'contract_cancelled',
  'review_received',
  'system',
]);

/**
 * Background email delivery — retries on failure with exponential
 * backoff. Triggered by `inngest.send('notification/dispatch-email')`
 * from `services/notifications.ts`.
 *
 * Why this is a separate function from the in-app notification:
 *   In-app rows need to be written synchronously so the bell badge
 *   updates the moment a mutation returns. Email can wait. Splitting
 *   them lets:
 *     - the user-facing mutation return in <100ms (no Resend wait),
 *     - the email retry 4 times over ~10 minutes if Resend hiccups,
 *     - failed deliveries surface in the Inngest dashboard for
 *       support to investigate.
 *
 * Retry policy:
 *   The default Inngest retry is 4 attempts with exponential
 *   backoff (rough 1m / 5m / 20m / 1h cadence). If all 4 fail the
 *   event is dead-lettered in the dashboard. For transactional
 *   emails like proposal-received this is the right shape — we'd
 *   rather deliver an hour late than not at all.
 *
 *   We DON'T retry on validation errors (unknown type, recipient
 *   has no email). Those are permanent failures; retrying just
 *   makes the dashboard noisier. The dispatcher itself returns
 *   gracefully for those cases without throwing — Inngest sees a
 *   successful run.
 */
// Handler extracted to a local const + explicit `any` typing so
// Turbopack's module-level evaluation sees a plain function reference
// (not a TypeScript-narrowed wrapper) when validating Inngest's
// `createFunction(options, handler)` runtime check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleDispatchEmail = async ({ event, step }: any) => {
  const data = event.data as {
    userId: string;
    type: string;
    title: string;
    body: string | null;
    metadata: Record<string, unknown> | null;
  };

  if (!KNOWN_TYPES.has(data.type)) {
    // Permanent failure — typo in caller. Don't retry.
    return { skipped: 'unknown-type', type: data.type };
  }

  // `step.run` wraps the side effect so Inngest can replay safely
  // on retry: if the email actually went out but the lambda died
  // before reporting success, the same event won't double-send
  // because the step result is memoised. (dispatchEmail itself
  // doesn't have idempotency keys for Resend; this is the
  // closest we get.)
  await step.run('send-email', async () => {
    await dispatchEmail({
      userId: data.userId,
      type: data.type as Parameters<typeof dispatchEmail>[0]['type'],
      title: data.title,
      body: data.body,
      metadata: data.metadata,
    });
  });

  return { delivered: true, userId: data.userId, type: data.type };
};

// Try the simplest possible call signature first — id + one trigger,
// nothing else. Inngest v4 docs use this shape in their quickstart.
export const dispatchEmailFn = inngest.createFunction(
  {
    id: 'notification-dispatch-email',
    triggers: [{ event: 'notification/dispatch-email' }],
  },
  handleDispatchEmail,
);
