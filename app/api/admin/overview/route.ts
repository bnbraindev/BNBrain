import { getAdminOverviewData } from '@/lib/server/admin-store';
import { getAdminAuthContext, readBearerToken } from '@/lib/server/admin-auth';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';
import { writeSecurityAuditLog } from '@/lib/server/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveToken(req: Request): string | null {
  const authToken = readBearerToken(req.headers.get('authorization'));
  if (authToken) return authToken;
  const { searchParams } = new URL(req.url);
  const queryToken = searchParams.get('token');
  return queryToken?.trim() || null;
}

export async function GET(req: Request) {
  const requestIp = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `admin-overview:ip:${requestIp}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }
  const token = resolveToken(req);
  const session = await getWalletAuthSessionFromRequest(req);
  const authContext = await getAdminAuthContext(token, session?.address ?? null, session?.purpose ?? null);
  if (!authContext.authorized) {
    await writeSecurityAuditLog({
      eventType: 'admin_overview',
      result: 'denied',
      address: session?.address ?? null,
      ipAddress: requestIp,
      actorPurpose: session?.purpose ?? null,
      metadata: {
        mode: token ? 'token' : 'wallet',
        tokenConfigured: authContext.tokenConfigured,
      },
    });
    return Response.json(
      {
        error: 'Unauthorized',
        mode: token ? 'token' : 'wallet',
        tokenConfigured: authContext.tokenConfigured,
      },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  try {
    const data = await getAdminOverviewData();
    await writeSecurityAuditLog({
      eventType: 'admin_overview',
      result: 'success',
      address: session?.address ?? null,
      ipAddress: requestIp,
      actorPurpose: session?.purpose ?? null,
      metadata: {
        mode: token ? 'token' : 'wallet',
        tokenConfigured: authContext.tokenConfigured,
      },
    });
    return Response.json(
      {
        generatedAt: Date.now(),
        data,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[admin overview GET]', error);
    return Response.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
