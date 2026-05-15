import { db, notifications, type NewNotification } from '@forj/db';
import { dispatchEmail } from './email-dispatch';

/**
 * Central entry point for in-app + email notifications.
 *
 * Two channels, decoupled:
 *   1. **In-app**: row inserted into `notifications`. Drives the bell + inbox.
 *   2. **Email**: rendered + sent via Resend. Best-effort, never blocks.
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
  // Awaited (not fire-and-forget) so serverless lambdas don't freeze the
  // background work. dispatchEmail() never throws — its own try/catch.
  //
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

  await dispatchEmail({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    metadata: {
      ...fallbackMeta,
      ...input.metadata, // explicit metadata always wins over entity fallback
      // Make actionUrl available to the loose templates (proposal_rejected
      // etc) without requiring every callsite to copy it into metadata.
      ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
    },
  });
}
