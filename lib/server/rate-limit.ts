import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();
const MAX_IN_MEMORY_BUCKETS = 5000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const STALE_DB_BUCKET_RETENTION_MS = 24 * 60 * 60 * 1000;
let lastDbCleanupAt = 0;

function cleanupExpiredBuckets(now: number): void {
  // Always evict expired entries first.
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
  // LRU-style eviction: if still over limit, remove oldest entries (inserted first).
  if (rateLimitStore.size > MAX_IN_MEMORY_BUCKETS) {
    const excess = rateLimitStore.size - MAX_IN_MEMORY_BUCKETS;
    let removed = 0;
    for (const key of rateLimitStore.keys()) {
      if (removed >= excess) break;
      rateLimitStore.delete(key);
      removed += 1;
    }
  }
}

function checkRateLimitInMemory(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitCheckResult {
  const now = Date.now();
  cleanupExpiredBuckets(now);
  const existing = rateLimitStore.get(params.key);
  if (!existing || existing.resetAt <= now) {
    // Atomic: set fresh bucket with count=1 in one operation.
    rateLimitStore.set(params.key, {
      count: 1,
      resetAt: now + params.windowMs,
    });
    return {
      allowed: true,
      remaining: Math.max(0, params.limit - 1),
      retryAfterMs: 0,
    };
  }
  // Atomic: read+increment in a single synchronous block (single-threaded JS).
  const nextCount = existing.count + 1;
  if (nextCount > params.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    };
  }
  existing.count = nextCount;
  return {
    allowed: true,
    remaining: Math.max(0, params.limit - nextCount),
    retryAfterMs: 0,
  };
}

async function cleanupDatabaseBuckets(now: number): Promise<void> {
  if (now - lastDbCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastDbCleanupAt = now;
  const pool = getDbPool();
  await pool.query(
    `
      DELETE FROM auth_rate_limits
      WHERE updated_at < $1
    `,
    [now - STALE_DB_BUCKET_RETENTION_MS]
  );
}

async function checkRateLimitInDatabase(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitCheckResult> {
  const now = Date.now();
  await ensureDatabaseSchema();
  const pool = getDbPool();
  await cleanupDatabaseBuckets(now).catch(() => undefined);
  const { rows } = await pool.query(
    `
      INSERT INTO auth_rate_limits (key, count, window_started_at, updated_at)
      VALUES ($1, 1, $2, $2)
      ON CONFLICT (key) DO UPDATE
        SET
          count = CASE
            WHEN auth_rate_limits.window_started_at + $3 <= $2 THEN 1
            ELSE auth_rate_limits.count + 1
          END,
          window_started_at = CASE
            WHEN auth_rate_limits.window_started_at + $3 <= $2 THEN $2
            ELSE auth_rate_limits.window_started_at
          END,
          updated_at = $2
      RETURNING count, window_started_at
    `,
    [params.key, now, params.windowMs]
  );
  const row = rows[0] as { count: number | string; window_started_at: number | string } | undefined;
  const currentCount = Number(row?.count ?? 0);
  const windowStartedAt = Number(row?.window_started_at ?? now);
  if (currentCount > params.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, windowStartedAt + params.windowMs - now),
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, params.limit - currentCount),
    retryAfterMs: 0,
  };
}

export function getRequestIpAddress(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

export async function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitCheckResult> {
  try {
    return await checkRateLimitInDatabase(params);
  } catch {
    return checkRateLimitInMemory(params);
  }
}
