import { TRPCError } from '@trpc/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

type RateLimitConfig = {
  requests: number;
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`;
};

const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, config: RateLimitConfig): Ratelimit | null {
  if (!redis) return null;
  const key = `${name}:${config.requests}:${config.window}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.requests, config.window),
      analytics: true,
      prefix: `workchain:ratelimit:${name}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

export async function checkRateLimit(
  identifier: string,
  name: string,
  config: RateLimitConfig,
): Promise<void> {
  const limiter = getLimiter(name, config);
  if (!limiter) return;

  const { success, remaining, reset } = await limiter.limit(identifier);

  if (!success) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Try again in ${Math.ceil((reset - Date.now()) / 1000)}s. Remaining: ${remaining}`,
    });
  }
}

export const RATE_LIMITS = {
  jobCreate: { requests: 10, window: '1 h' } satisfies RateLimitConfig,
  proposalCreate: { requests: 20, window: '1 h' } satisfies RateLimitConfig,
  messageSend: { requests: 60, window: '1 m' } satisfies RateLimitConfig,
  // Per-(sender, receiver) throttle layered on top of `messageSend`.
  // Stops one user from DM-bombing a specific person within the
  // global 60/min budget (which would be 60 in-app notifications +
  // 60 bell badges for the victim, plenty for harassment). 10 per
  // minute matches a natural rapid chat exchange + permits short
  // bursts of replies without nagging.
  messageSendToReceiver: { requests: 10, window: '1 m' } satisfies RateLimitConfig,
  jobSearch: { requests: 100, window: '1 m' } satisfies RateLimitConfig,
  auth: { requests: 20, window: '1 m' } satisfies RateLimitConfig,
  // Reviews are gated by state machine (one per (contract, reviewer) via DB
  // unique index), so abuse vectors are limited to "spam-create against
  // many contracts at once". 20/h is comfortable for a power user yet stops
  // automated firehosing.
  reviewCreate: { requests: 20, window: '1 h' } satisfies RateLimitConfig,
  // Pre-fund term edits — client can revise but shouldn't oscillate.
  contractEdit: { requests: 30, window: '1 h' } satisfies RateLimitConfig,
  // Service publishing — 10/h is plenty for a real freelancer, kills bots.
  serviceCreate: { requests: 10, window: '1 h' } satisfies RateLimitConfig,
} as const;
