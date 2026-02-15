import { z } from 'zod';
import { createWalletAuthChallenge } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';
import { normalizeWalletAddress } from '@/lib/server/admin-owner';
import { writeSecurityAuditLog } from '@/lib/server/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChallengeBodySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  purpose: z.enum(['user', 'admin']).optional(),
  chainId: z.number().int().positive().optional(),
});

const DEFAULT_SIWE_CHAIN_ID = 56;

function resolveConfiguredSiweChainIds(): Set<number> | null {
  const raw = process.env.SIWE_ALLOWED_CHAIN_IDS?.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === 'all' || normalized === '*') return null;
  const parsed = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
  if (parsed.length === 0) return null;
  return new Set(parsed);
}

function isAllowedSiweChainId(chainId: number): boolean {
  if (!Number.isInteger(chainId) || chainId <= 0) return false;
  const configured = resolveConfiguredSiweChainIds();
  if (!configured) return true;
  return configured.has(chainId);
}

function resolveRequestOrigin(req: Request): { domain: string; uri: string } | null {
  // Prefer server-pinned domain (prevents Origin header spoofing)
  const pinnedDomain = process.env.SIWE_DOMAIN;
  if (pinnedDomain) {
    const proto = pinnedDomain.includes('localhost') ? 'http' : 'https';
    return { domain: pinnedDomain, uri: `${proto}://${pinnedDomain}` };
  }
  const url = new URL(req.url);
  const originHeader = req.headers.get('origin');
  // Behind reverse proxy (Cloudflare Tunnel, Nginx), trust the Origin header
  // as the authoritative source of the public-facing domain.
  if (originHeader) {
    try {
      const parsedOrigin = new URL(originHeader);
      return { domain: parsedOrigin.host, uri: parsedOrigin.origin };
    } catch {
      return null;
    }
  }
  // Fallback to Host header for non-browser clients
  const hostHeader = req.headers.get('host') ?? req.headers.get('x-forwarded-host');
  if (hostHeader) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    return { domain: hostHeader, uri: `${proto}://${hostHeader}` };
  }
  return { domain: url.host, uri: url.origin };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = ChallengeBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const requestIp = getRequestIpAddress(req);
  const normalizedAddress = normalizeWalletAddress(parsed.data.address) ?? parsed.data.address;
  const authPurpose = parsed.data.purpose ?? 'user';
  const requestOrigin = resolveRequestOrigin(req);
  if (!requestOrigin) {
    await writeSecurityAuditLog({
      eventType: 'siwe_challenge',
      result: 'denied',
      address: normalizedAddress,
      ipAddress: requestIp,
      actorPurpose: authPurpose,
      metadata: {
        reason: 'invalid_origin',
      },
    });
    return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  const chainId = parsed.data.chainId ?? DEFAULT_SIWE_CHAIN_ID;
  if (!isAllowedSiweChainId(chainId)) {
    await writeSecurityAuditLog({
      eventType: 'siwe_challenge',
      result: 'denied',
      address: normalizedAddress,
      ipAddress: requestIp,
      actorPurpose: authPurpose,
      metadata: {
        reason: 'unsupported_chain',
        chainId,
      },
    });
    return Response.json(
      {
        error: 'Unsupported chain for SIWE challenge',
      },
      { status: 400 }
    );
  }
  const byAddressRateLimit = await checkRateLimit({
    key: `siwe:challenge:address:${requestIp}:${normalizedAddress}`,
    limit: 6,
    windowMs: 60_000,
  });
  if (!byAddressRateLimit.allowed) {
    await writeSecurityAuditLog({
      eventType: 'siwe_challenge',
      result: 'rate_limited',
      address: normalizedAddress,
      ipAddress: requestIp,
      actorPurpose: authPurpose,
      metadata: {
        bucket: 'address',
      },
    });
    return Response.json(
      {
        error: 'Too many challenge requests. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(byAddressRateLimit.retryAfterMs / 1000)),
          'Cache-Control': 'no-store',
        },
      }
    );
  }
  const byIpRateLimit = await checkRateLimit({
    key: `siwe:challenge:ip:${requestIp}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!byIpRateLimit.allowed) {
    await writeSecurityAuditLog({
      eventType: 'siwe_challenge',
      result: 'rate_limited',
      address: normalizedAddress,
      ipAddress: requestIp,
      actorPurpose: authPurpose,
      metadata: {
        bucket: 'ip',
      },
    });
    return Response.json(
      {
        error: 'Too many challenge requests from this IP. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(byIpRateLimit.retryAfterMs / 1000)),
          'Cache-Control': 'no-store',
        },
      }
    );
  }
  try {
    const challenge = await createWalletAuthChallenge({
      address: parsed.data.address,
      purpose: authPurpose,
      chainId,
      domain: requestOrigin.domain,
      uri: requestOrigin.uri,
    });
    await writeSecurityAuditLog({
      eventType: 'siwe_challenge',
      result: 'success',
      address: challenge.address,
      ipAddress: requestIp,
      actorPurpose: challenge.purpose,
      metadata: {
        chainId: challenge.chainId,
        domain: requestOrigin.domain,
      },
    });
    return Response.json(
      {
        nonce: challenge.nonce,
        message: challenge.message,
        expiresAt: challenge.expiresAt,
        issuedAt: challenge.issuedAt,
        purpose: challenge.purpose,
        address: challenge.address,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    await writeSecurityAuditLog({
      eventType: 'siwe_challenge',
      result: 'failure',
      address: normalizedAddress,
      ipAddress: requestIp,
      actorPurpose: authPurpose,
      metadata: {
        reason: error instanceof Error ? error.message : 'create_challenge_failed',
      },
    });
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create challenge' },
      { status: 400 }
    );
  }
}
