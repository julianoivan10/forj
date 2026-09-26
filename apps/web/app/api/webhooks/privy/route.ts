import { checkRateLimit, clientIp, log, RATE_LIMITS } from '@forj/api';
import { db, eq, users } from '@forj/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getPrivyClient } from '@/lib/privy/server';

type PrivyWebhookEvent = {
  type: string;
  user?: {
    id: string;
    email?: { address: string };
    google?: { email: string; name: string };
    twitter?: { username: string; name?: string };
  };
};

/**
 * Privy user lifecycle webhook.
 *
 * Every request must carry a valid Svix signature for
 * `PRIVY_WEBHOOK_SECRET`. The route fails closed: with no secret
 * configured it rejects everything. An unsigned endpoint let anyone POST
 * a forged `user.updated` for a known privyId and overwrite that user's
 * email (redirecting their notifications).
 *
 * Replays: Svix rejects timestamps older than ~5 minutes, and processing is
 * an idempotent upsert, so a replay inside that window changes nothing.
 *
 * Wallet addresses are deliberately NOT written here. The canonical
 * payout wallet (smart wallet first) is synced from a verified Privy
 * session in `getUserFromToken`; letting the webhook write the raw EOA
 * would flip a user's payout address back and forth.
 */
export async function POST(req: NextRequest) {
  try {
    await checkRateLimit(clientIp(req.headers), 'webhook', RATE_LIMITS.webhook);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const secret = process.env.PRIVY_WEBHOOK_SECRET;
  if (!secret) {
    log('error', 'webhook.privy_not_configured');
    return NextResponse.json({ ok: false, error: 'webhook not configured' }, { status: 503 });
  }

  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signature = req.headers.get('svix-signature');
  if (!id || !timestamp || !signature) {
    log('warn', 'webhook.privy_unsigned', { ip: clientIp(req.headers) });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: PrivyWebhookEvent;
  try {
    body = (await req.json()) as PrivyWebhookEvent;
    await getPrivyClient().verifyWebhook(body, { id, timestamp, signature }, secret);
  } catch {
    log('warn', 'webhook.privy_bad_signature', { svixId: id, ip: clientIp(req.headers) });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if ((body.type !== 'user.created' && body.type !== 'user.updated') || !body.user?.id) {
    return NextResponse.json({ ok: true, ignored: body.type });
  }

  const { user } = body;
  const email = user.email?.address ?? user.google?.email;
  const displayName =
    user.google?.name ?? user.twitter?.name ?? email?.split('@')[0] ?? 'Forj User';

  const existing = await db.query.users.findFirst({
    where: eq(users.privyId, user.id),
    columns: { id: true },
  });

  if (!existing) {
    await db
      .insert(users)
      .values({ privyId: user.id, email, displayName })
      .onConflictDoNothing({ target: users.privyId });
  } else if (email) {
    await db.update(users).set({ email }).where(eq(users.privyId, user.id));
  }

  return NextResponse.json({ ok: true });
}
