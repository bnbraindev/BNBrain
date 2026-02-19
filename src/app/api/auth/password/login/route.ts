import { z } from 'zod';
import { verifyAdminCredential } from '@/lib/server/admin-password';
import { createPasswordSession, buildAuthSessionCookie } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';
import { writeSecurityAuditLog } from '@/lib/server/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LoginBodySchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(256),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = LoginBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const requestIp = getRequestIpAddress(req);
  const { username, password } = parsed.data;

  // Rate limit by IP
  const ipRl = await checkRateLimit({
    key: `password:login:ip:${requestIp}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!ipRl.allowed) {
    await writeSecurityAuditLog({
      eventType: 'password_login',
      result: 'rate_limited',
      ipAddress: requestIp,
      metadata: { username, bucket: 'ip' },
    });
    return Response.json(
      { error: 'Too many login attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(ipRl.retryAfterMs / 1000)),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // Rate limit by username
  const userRl = await checkRateLimit({
    key: `password:login:user:${username.toLowerCase()}`,
    limit: 5,
    windowMs: 60_000,
  });
  if (!userRl.allowed) {
    await writeSecurityAuditLog({
      eventType: 'password_login',
      result: 'rate_limited',
      ipAddress: requestIp,
      metadata: { username, bucket: 'username' },
    });
    return Response.json(
      { error: 'Too many login attempts for this account. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(userRl.retryAfterMs / 1000)),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  try {
    const valid = await verifyAdminCredential(username, password);
    if (!valid) {
      await writeSecurityAuditLog({
        eventType: 'password_login',
        result: 'failure',
        ipAddress: requestIp,
        metadata: { username, reason: 'invalid_credentials' },
      });
      return Response.json(
        { error: 'Invalid username or password' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const session = await createPasswordSession(username);

    await writeSecurityAuditLog({
      eventType: 'password_login',
      result: 'success',
      ipAddress: requestIp,
      actorPurpose: 'admin',
      metadata: { username },
    });

    return Response.json(
      {
        ok: true,
        username: username.trim().toLowerCase(),
        purpose: 'admin',
        expiresAt: session.expiresAt,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': buildAuthSessionCookie(session.token, session.expiresAt),
        },
      }
    );
  } catch (error) {
    console.error('[password login POST]', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
