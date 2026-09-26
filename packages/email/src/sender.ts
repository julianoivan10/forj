import { Resend } from 'resend';
import { fromEmail } from './theme';

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
}

export async function sendEmail(opts: SendEmailOptions) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY missing — skipping send:', opts.subject);
    return { id: 'dev-skipped', skipped: true as const };
  }
  const result = await resend.emails.send({
    from: `Forj <${fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    react: opts.react,
    replyTo: opts.replyTo,
  });
  if (result.error) {
    throw new Error(`Resend failed: ${result.error.message}`);
  }
  return { id: result.data?.id ?? 'unknown', skipped: false as const };
}
