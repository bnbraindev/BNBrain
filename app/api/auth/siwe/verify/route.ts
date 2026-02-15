import { z } from 'zod';
import {
  bindInitialAdminWalletAddress,
  getAdminWalletAddress,
  getAdminWalletAddresses,
  isAdminWalletAddress,
  normalizeWalletAddress,
} from '@/lib/server/admin-owner';
import {
  buildAuthSessionCookie,
  verifyWalletAuthChallenge,
} from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';
import { writeSecurityAuditLog } from '@/lib/server/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VerifyBodySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  nonce: z.string().regex(/^[a-fA-F0-9]{32}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
  chainId: z.number().int().positive(),
  singleDevice: z.boolean().optional(),
  purpose: z.enum(['user', 'admin']).optional(),
});

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
  const parsed = VerifyBodySchema.safeParse(body);
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
      eventType: 'siwe_verify',
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
  if (!isAllowedSiweChainId(parsed.data.chainId)) {
    await writeSecurityAuditLog({
      eventType: 'siwe_verify',
      result: 'denied',
      address: normalizedAddress,
      ipAddress: requestIp,
      actorPurpose: authPurpose,
      metadata: {
        reason: 'unsupported_chain',
        chainId: parsed.data.chainId,
      },
    });
    return Response.json({ error: 'Unsupported chain for SIWE verification' }, { status: 400 });
  }
  const verifyRateLimit = await checkRateLimit({
    key: `siwe:verify:address:${requestIp}:${normalizedAddress}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!verifyRateLimit.allowed) {
    await writeSecurityAuditLog({
      eventType: 'siwe_verify',
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
        error: 'Too many verification attempts. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(verifyRateLimit.retryAfterMs / 1000)),
          'Cache-Control': 'no-store',
        },
      }
    );
  }
  const verifyIpRateLimit = await checkRateLimit({
    key: `siwe:verify:ip:${requestIp}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!verifyIpRateLimit.allowed) {
    await writeSecurityAuditLog({
      eventType: 'siwe_verify',
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
        error: 'Too many verification attempts from this IP. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(verifyIpRateLimit.retryAfterMs / 1000)),
          'Cache-Control': 'no-store',
        },
      }
    );
  }
  try {
    const session = await verifyWalletAuthChallenge({
      address: parsed.data.address,
      nonce: parsed.data.nonce,
      signature: parsed.data.signature,
      purpose: authPurpose,
      singleDevice: parsed.data.singleDevice ?? false,
      expectedDomain: requestOrigin.domain,
      expectedUri: requestOrigin.uri,
      expectedChainId: parsed.data.chainId,
    });
    if (!session) {
      await writeSecurityAuditLog({
        eventType: 'siwe_verify',
        result: 'failure',
        address: normalizedAddress,
        ipAddress: requestIp,
        actorPurpose: authPurpose,
        metadata: {
          reason: 'invalid_signature_or_expired_challenge',
        },
      });
      return Response.json({ error: 'Invalid signature or expired challenge' }, { status: 401 });
    }
    await bindInitialAdminWalletAddress(session.address);
    const [adminWalletAddress, adminWalletAddresses, isAdmin] = await Promise.all([
      getAdminWalletAddress(),
      getAdminWalletAddresses(),
      isAdminWalletAddress(session.address),
    ]);
    await writeSecurityAuditLog({
      eventType: 'siwe_verify',
      result: 'success',
      address: session.address,
      ipAddress: requestIp,
      actorPurpose: session.purpose,
      metadata: {
        chainId: parsed.data.chainId,
        singleDevice: Boolean(parsed.data.singleDevice),
        isAdmin,
      },
    });
    return Response.json(
      {
        ok: true,
        address: session.address,
        purpose: session.purpose,
        expiresAt: session.expiresAt,
        renewAt: session.renewAt,
        isAdmin,
        adminWalletAddress: isAdmin ? adminWalletAddress : undefined,
        adminWalletAddresses: isAdmin ? adminWalletAddresses : undefined,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': buildAuthSessionCookie(session.token, session.expiresAt),
        },
      }
    );
  } catch (error) {
    await writeSecurityAuditLog({
      eventType: 'siwe_verify',
      result: 'failure',
      address: normalizedAddress,
      ipAddress: requestIp,
      actorPurpose: authPurpose,
      metadata: {
        reason: error instanceof Error ? error.message : 'verify_failed',
      },
    });
    console.error('[siwe verify POST]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
