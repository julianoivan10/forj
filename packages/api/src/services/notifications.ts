import { db, notifications, type NewNotification } from '@forj/db';
import { inngest } from '../inngest/client';
import { dispatchEmail } from './email-dispatch';

/**
 * Central entry point for in-app + email notifications.
 *
 * Two channels, decoupled:
 *   1. **In-app**: row inserted into `notifications` synchronously.
 *      Drives the bell + inbox — has to land immediately.
 *   2. **Email**: enqueued via Inngest (`notification/dispatch-email`)
 *      for retried background delivery. The mutation returns fast;
 *      Resend RTT + flakiness is absorbed by the queue. If Inngest
 *      isn't configured (local dev without the CLI) we fall back to
 *      inline `dispatchEmail()` so dev runs identically to prod from
 *      the user's point of view.
 *
 * Both channels swallow their own errors so that a downstream failure
 * (Resend down, DB hiccup) never bubbles up to the procedure call. The
 * caller's business logic (proposal accept, contract fund, etc) must always
 * succeed even if notifications fail.
 *
 * Self-notification guard: actions never notify their own actor — the user
 * already knows they did the thing.
 */
export async function notify(input: {
  userId: string;
  actorId?: string | null;
  type: NewNotification['type'];
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  // Don't notify someone about an action they took themselves.
  if (input.actorId && input.actorId === input.userId) return;

  // ── 1. In-app row ──
  try {
    await db.insert(notifications).values({
      userId: input.userId,
      actorId: input.actorId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      actionUrl: input.actionUrl ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[notify] insert failed:', err);
    }
  }

  // ── 2. Email ──
  // We synthesise canonical fallbacks from the entity reference so individual
  // callsites don't have to remember to copy `contractId`/`jobId` into
  // metadata. The dispatcher prefers explicit metadata fields but falls back
  // to entityId for the matching entityType.
  const fallbackMeta: Record<string, unknown> = {};
  if (input.entityType === 'contract' && input.entityId) {
    fallbackMeta.contractId = input.entityId;
  }
  if (input.entityType === 'job' && input.entityId) {
    fallbackMeta.jobId = input.entityId;
  }
  if (input.entityType === 'proposal' && input.entityId) {
    fallbackMeta.proposalId = input.entityId;
  }

  const dispatchPayload = {
    userId: input.userId,
    type: input.type as string,
    title: input.title,
    body: input.body ?? null,
    metadata: {
      ...fallbackMeta,
      ...input.metadata, // explicit metadata always wins over entity fallback
      // Make actionUrl available to the loose templates (proposal_rejected
      // etc) without requiring every callsite to copy it into metadata.
      ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
    } as Record<string, unknown>,
  };

  // Prefer Inngest in any environment where the event key is set —
  // that covers cloud production AND local dev with the Inngest CLI
  // running (`pnpm dlx inngest-cli@latest dev` sets the key
  // automatically). Anywhere else (CI, dev without the CLI), fall
  // back to inline dispatch so behaviour stays consistent.
  const useInngest = Boolean(process.env.INNGEST_EVENT_KEY);
  if (useInngest) {
    try {
      await inngest.send({
        name: 'notification/dispatch-email',
        data: dispatchPayload,
      });
    } catch (err) {
      // Inngest can't accept the event (network blip, rate limit) —
      // log and fall through to direct dispatch so the email still
      // has a chance to land. We don't re-throw because the caller's
      // mutation succeeded; email is best-effort.
      if (process.env.NODE_ENV !== 'production') {
        console.error('[notify] inngest.send failed, falling back to inline:', err);
      }
      await dispatchEmail({
        ...dispatchPayload,
        type: dispatchPayload.type as Parameters<typeof dispatchEmail>[0]['type'],
      });
    }
  } else {
    await dispatchEmail({
      ...dispatchPayload,
      type: dispatchPayload.type as Parameters<typeof dispatchEmail>[0]['type'],
    });
  }
}
