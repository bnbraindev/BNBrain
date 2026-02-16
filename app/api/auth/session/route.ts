import { isAdminWalletAddress } from '@/lib/server/admin-owner';
import {
  buildAuthSessionCookie,
  buildClearedAuthSessionCookie,
  getWalletAuthSessionFromRequest,
  getWalletAuthSessionFromToken,
  readAuthSessionTokenFromRequest,
  renewWalletAuthSessionToken,
  revokeWalletAuthSessionsByAddress,
  revokeWalletAuthSessionToken,
  shouldRenewWalletAuthSession,
} from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ip = getRequestIpAddress(req);
    const rl = await checkRateLimit({ key: `session:ip:${ip}`, limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
    }
    const url = new URL(req.url);
    const forceRenew = url.searchParams.get('renew') === 'force';
    const token = readAuthSessionTokenFromRequest(req);
    const session = await getWalletAuthSessionFromRequest(req);
    if (!session) {
      return Response.json(
        { authenticated: false },
        {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }
    let currentSession = session;
    let setCookieHeader: string | undefined;
    if (token && (forceRenew || shouldRenewWalletAuthSession(session.expiresAt))) {
      const renewed = await renewWalletAuthSessionToken(token);
      if (renewed) {
        currentSession = renewed;
        setCookieHeader = buildAuthSessionCookie(renewed.token, renewed.expiresAt);
      }
    }
    const isAdmin = await isAdminWalletAddress(currentSession.address);
    return Response.json(
      {
        authenticated: true,
        address: currentSession.address,
        purpose: currentSession.purpose,
        expiresAt: currentSession.expiresAt,
        renewAt: currentSession.renewAt,
        isAdmin,
      },
      {
        headers: setCookieHeader
          ? {
              'Cache-Control': 'no-store',
              'Set-Cookie': setCookieHeader,
            }
          : { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('[auth session GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const revokeAllScope = url.searchParams.get('scope') === 'all';
    const token = readAuthSessionTokenFromRequest(req);
    if (revokeAllScope) {
      const currentSession = await getWalletAuthSessionFromToken(token);
      if (currentSession) {
        await revokeWalletAuthSessionsByAddress(currentSession.address, currentSession.purpose);
      }
    }
    await revokeWalletAuthSessionToken(token);
    return Response.json(
      { ok: true, scope: revokeAllScope ? 'all' : 'current' },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': buildClearedAuthSessionCookie(),
        },
      }
    );
  } catch (error) {
    console.error('[auth session DELETE]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
