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
import { resolveRequestOrigin, isAllowedSiweChainId } from '@/lib/server/siwe-config';

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
  const requestOrigin = await resolveRequestOrigin(req);
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
  if (!(await isAllowedSiweChainId(parsed.data.chainId))) {
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
