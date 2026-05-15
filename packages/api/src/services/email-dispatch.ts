import { db, eq, users } from '@forj/db';
import {
  ContractFundedEmail,
  DisputeOpenedEmail,
  MessageNotificationEmail,
  PaymentReleasedEmail,
  ProposalAcceptedEmail,
  ProposalReceivedEmail,
  WelcomeEmail,
  WorkSubmittedEmail,
  sendEmail,
} from '@forj/email';

/**
 * Email side-channel for in-app notifications.
 *
 * Architecture:
 *   `notify()` (services/notifications.ts) writes a row to the `notifications`
 *   table for in-app display, then calls `dispatchEmail()` for the same event.
 *   The two channels are decoupled — an email failure does NOT roll back the
 *   in-app notification, and an in-app failure does NOT block the email.
 *
 *   We dispatch async-but-awaited so that in `vercel/serverless` runtimes the
 *   send completes before the request handler returns. This trades a few
 *   hundred ms of latency for guaranteed delivery — better than fire-and-
 *   forget which gets killed when the lambda freezes.
 *
 * Type routing:
 *   Each notification type maps to ONE template. Templates are React Email
 *   components imported from `@forj/email`. Types that aren't in the
 *   switch are silently skipped — message_received is the canonical example
 *   (too noisy for email; users get those in-app only).
 *
 * Metadata contract:
 *   Templates have specific prop shapes. The `metadata` jsonb on a
 *   notification is loosely typed (`Record<string, unknown>`), so we cast +
 *   default-fill at the boundary. If a required field is missing we log and
 *   skip rather than throw — the in-app notification has already landed,
 *   email is best-effort.
 */

type NotificationType =
  | 'proposal_received'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'job_awarded'
  | 'message_received'
  | 'contract_funded'
  | 'contract_submitted'
  | 'contract_revision_requested'
  | 'contract_completed'
  | 'contract_disputed'
  | 'contract_cancelled'
  | 'review_received'
  | 'system';

export interface EmailDispatchInput {
  /** Recipient — same userId as the in-app notification. */
  userId: string;
  type: NotificationType;
  /** Title from the in-app notification — re-used as the email subject. */
  title: string;
  /** Body falls through to plain-text fallback emails (system / unknown types). */
  body?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Notification types we DO send email for. Anything outside this set is
 * silently dropped — keeps the inbox quiet for chatty types like messages.
 *
 * Intentionally NOT including:
 *   - message_received (would spam)
 *   - review_received (in-app sufficient)
 */
const EMAIL_TYPES = new Set<NotificationType>([
  'proposal_received',
  'proposal_accepted',
  'proposal_rejected',
  'job_awarded',
  'contract_funded',
  'contract_submitted',
  'contract_revision_requested',
  'contract_completed',
  'contract_disputed',
  'contract_cancelled',
]);

/**
 * Public entrypoint. Always best-effort — never throws to the caller.
 */
export async function dispatchEmail(input: EmailDispatchInput): Promise<void> {
  if (!EMAIL_TYPES.has(input.type)) return;

  let recipient: { email: string | null; displayName: string } | null = null;
  try {
    const row = await db.query.users.findFirst({
      where: eq(users.id, input.userId),
      columns: { email: true, displayName: true },
    });
    if (!row) return; // user deleted between insert + dispatch — bail
    recipient = row;
  } catch (err) {
    logSkip(`failed to look up recipient ${input.userId}`, err);
    return;
  }

  if (!recipient.email) return; // user has no email on file — silent skip

  try {
    const rendered = render(input, recipient);
    if (!rendered) return; // template builder bailed
    await sendEmail({
      to: recipient.email,
      subject: rendered.subject,
      react: rendered.react,
    });
  } catch (err) {
    logSkip(`send failed for ${input.type} to ${recipient.email}`, err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────

interface Rendered {
  subject: string;
  react: React.ReactElement;
}

/**
 * Per-type template selector. Keeping the metadata typing loose (one big cast
 * at the boundary) is intentional — adding a new notif type only requires
 * adding a `case` here, no schema changes.
 */
function render(
  input: EmailDispatchInput,
  recipient: { email: string | null; displayName: string },
): Rendered | null {
  const meta = (input.metadata ?? {}) as Record<string, unknown>;
  const subject = input.title;

  // Helper: pull a string field with default. Returns null if required &
  // missing — caller can decide to skip.
  const str = (key: string, fallback?: string): string | null => {
    const v = meta[key];
    if (typeof v === 'string' && v.length > 0) return v;
    return fallback ?? null;
  };

  switch (input.type) {
    case 'proposal_received': {
      const freelancerName = str('freelancerName', 'A freelancer')!;
      const jobTitle = str('jobTitle');
      const bidAmount = str('bidAmount', '');
      const jobId = str('jobId');
      if (!jobTitle || !jobId) return missing(input.type, ['jobTitle', 'jobId']);
      return {
        subject,
        react: ProposalReceivedEmail({
          clientName: recipient.displayName,
          freelancerName,
          jobTitle,
          bidAmount: bidAmount ?? '',
          jobId,
        }),
      };
    }

    case 'proposal_accepted': {
      const jobTitle = str('jobTitle');
      const contractId = str('contractId');
      if (!jobTitle || !contractId) return missing(input.type, ['jobTitle', 'contractId']);
      return {
        subject,
        react: ProposalAcceptedEmail({
          freelancerName: recipient.displayName,
          jobTitle,
          contractId,
        }),
      };
    }

    case 'contract_funded': {
      const jobTitle = str('contractTitle') ?? str('jobTitle');
      const contractId = str('contractId');
      const txHash = str('txHash') ?? '';
      const amount = str('amount') ?? str('totalAmount') ?? '';
      if (!jobTitle || !contractId) return missing(input.type, ['contractTitle', 'contractId']);
      return {
        subject,
        react: ContractFundedEmail({
          freelancerName: recipient.displayName,
          jobTitle,
          amount,
          contractId,
          txHash,
        }),
      };
    }

    case 'contract_submitted': {
      const jobTitle = str('contractTitle') ?? str('jobTitle');
      const contractId = str('contractId');
      const freelancerName = str('freelancerName', 'The freelancer')!;
      const autoReleaseAt = str('autoReleaseAt');
      const autoReleaseDate = autoReleaseAt
        ? new Date(autoReleaseAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '';
      if (!jobTitle || !contractId) return missing(input.type, ['contractTitle', 'contractId']);
      return {
        subject,
        react: WorkSubmittedEmail({
          clientName: recipient.displayName,
          freelancerName,
          jobTitle,
          contractId,
          autoReleaseDate,
        }),
      };
    }

    case 'contract_completed': {
      const jobTitle = str('contractTitle') ?? str('jobTitle');
      const contractId = str('contractId');
      const amount = str('freelancerAmount') ?? str('amount') ?? '';
      const txHash = str('releaseTxHash') ?? '';
      if (!jobTitle || !contractId) return missing(input.type, ['contractTitle', 'contractId']);
      return {
        subject,
        react: PaymentReleasedEmail({
          freelancerName: recipient.displayName,
          jobTitle,
          amount,
          contractId,
          txHash,
        }),
      };
    }

    case 'contract_disputed': {
      const jobTitle = str('contractTitle') ?? str('jobTitle');
      const contractId = str('contractId');
      const reason = str('reason') ?? str('disputeReason') ?? '';
      const openerName = str('openerName') ?? str('actorName') ?? 'The other party';
      if (!jobTitle || !contractId) return missing(input.type, ['contractTitle', 'contractId']);
      return {
        subject,
        react: DisputeOpenedEmail({
          recipientName: recipient.displayName,
          openerName,
          jobTitle,
          reason,
          contractId,
        }),
      };
    }

    // Types where the canonical template doesn't fit precisely — still send a
    // simple message-style email so the user gets *some* off-app signal.
    // The MessageNotificationEmail template expects a `conversationId` for
    // its CTA link; we synthesise one from the action url for these
    // non-message types so the deep link still lands somewhere relevant.
    case 'proposal_rejected':
    case 'job_awarded':
    case 'contract_revision_requested':
    case 'contract_cancelled': {
      const conversationId =
        str('conversationId') ?? str('contractId') ?? str('jobId') ?? input.userId;
      return {
        subject,
        react: MessageNotificationEmail({
          recipientName: recipient.displayName,
          senderName: 'WorkChain',
          snippet: input.body ?? input.title,
          conversationId,
        }),
      };
    }

    default: {
      return null;
    }
  }
}

function missing(type: string, fields: string[]): null {
  logSkip(`metadata missing for ${type}: needs ${fields.join(', ')}`);
  return null;
}

function logSkip(msg: string, err?: unknown) {
  if (process.env.NODE_ENV === 'production') return;
  if (err) {
    console.warn(`[email-dispatch] ${msg}:`, err);
  } else {
    console.warn(`[email-dispatch] ${msg}`);
  }
}

/** Re-export for `welcome` flow (called explicitly on first onboarding). */
export { WelcomeEmail };
