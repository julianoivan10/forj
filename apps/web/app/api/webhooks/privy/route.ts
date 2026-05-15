import { db, eq, users } from '@forj/db';
import { NextResponse, type NextRequest } from 'next/server';

type PrivyWebhookEvent = {
  type: string;
  user: {
    id: string;
    email?: { address: string };
    google?: { email: string; name: string };
    twitter?: { username: string; name?: string };
    wallet?: { address: string };
    linkedAccounts: Array<{
      type: string;
      address?: string;
      email?: string;
      name?: string;
    }>;
  };
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PrivyWebhookEvent;

  if (body.type !== 'user.created' && body.type !== 'user.updated') {
    return NextResponse.json({ ok: true, ignored: body.type });
  }

  const { user } = body;
  const wallet = user.linkedAccounts.find((a) => a.type === 'wallet')?.address ?? user.wallet?.address;
  const email = user.email?.address ?? user.google?.email;
  const displayName = user.google?.name ?? user.twitter?.name ?? email?.split('@')[0] ?? 'Forj User';

  const existing = await db.query.users.findFirst({
    where: eq(users.privyId, user.id),
    columns: { id: true },
  });

  if (!existing) {
    await db.insert(users).values({
      privyId: user.id,
      walletAddress: wallet,
      email,
      displayName,
    });
  } else {
    await db
      .update(users)
      .set({
        walletAddress: wallet,
        email,
      })
      .where(eq(users.privyId, user.id));
  }

  return NextResponse.json({ ok: true });
}
