import { z } from 'zod';
import {
  addAdminWalletAddress,
  getAdminWalletAddress,
  getAdminWalletAddresses,
  normalizeWalletAddress,
  removeAdminWalletAddress,
} from '@/lib/server/admin-owner';
import { getAdminAuthContext, readBearerToken } from '@/lib/server/admin-auth';
import {
  getWalletAuthSessionFromRequest,
  revokeWalletAuthSessionsByAddress,
} from '@/lib/server/siwe-auth';
import { getRequestIpAddress } from '@/lib/server/rate-limit';
import { writeSecurityAuditLog } from '@/lib/server/security-audit';
import { hasAnyAdminCredentials } from '@/lib/server/admin-password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UpdateBodySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

function resolveToken(req: Request): string | null {
  const authToken = readBearerToken(req.headers.get('authorization'));
  if (authToken) return authToken;
  const { searchParams } = new URL(req.url);
  const queryToken = searchParams.get('token');
  return queryToken?.trim() || null;
}

function sameAddresses(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

async function assertAuthorizedAdminRequest(req: Request): Promise<
  | {
      ok: true;
      token: string | null;
      session: Awaited<ReturnType<typeof getWalletAuthSessionFromRequest>>;
      authMode: 'token' | 'wallet' | 'setup';
      requestIp: string;
    }
  | { ok: false; response: Response }
> {
  const token = resolveToken(req);
  const session = await getWalletAuthSessionFromRequest(req);
  const requestIp = getRequestIpAddress(req);
  const authContext = await getAdminAuthContext(token, session?.address ?? null, session?.purpose ?? null);
  const authMode: 'token' | 'wallet' | 'setup' = token ? 'token' : 'wallet';

  // Allow initial setup: no admin wallets AND no admin credentials
  if (!authContext.authorized) {
    const [hasCredentials] = await Promise.all([hasAnyAdminCredentials()]);
    if (authContext.adminWalletAddresses.length === 0 && !hasCredentials) {
      return { ok: true, token: null, session: null, authMode: 'setup', requestIp };
    }
  }

  if (!authContext.authorized) {
    await writeSecurityAuditLog({
      eventType: 'admin_owners_manage',
      result: 'denied',
      address: session?.address ?? null,
      ipAddress: requestIp,
      actorPurpose: session?.purpose ?? null,
      metadata: {
        reason: 'unauthorized',
        mode: authMode,
        tokenConfigured: authContext.tokenConfigured,
      },
    });
    return {
      ok: false,
      response: Response.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
        }
      ),
    };
  }

  if (!token && !session) {
    await writeSecurityAuditLog({
      eventType: 'admin_owners_manage',
      result: 'denied',
      address: null,
      ipAddress: requestIp,
      actorPurpose: null,
      metadata: {
        reason: 'wallet_session_required',
      },
    });
    return {
      ok: false,
      response: Response.json(
        { error: 'Wallet session required' },
        {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
        }
      ),
    };
  }

  return {
    ok: true,
    token,
    session,
    authMode,
    requestIp,
  };
}

export async function GET(req: Request) {
  const auth = await assertAuthorizedAdminRequest(req);
  if (!auth.ok) return auth.response;
  try {
    const [adminWalletAddress, adminWalletAddresses] = await Promise.all([
      getAdminWalletAddress(),
      getAdminWalletAddresses(),
    ]);
    return Response.json(
      {
        ok: true,
        adminWalletAddress,
        adminWalletAddresses,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('[admin admins GET]', error);
    return Response.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}

export async function POST(req: Request) {
  const auth = await assertAuthorizedAdminRequest(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = UpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const normalizedAddress = normalizeWalletAddress(parsed.data.address);
  if (!normalizedAddress) {
    return Response.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    const before = await getAdminWalletAddresses();
    const updatedAdminWalletAddresses = await addAdminWalletAddress(normalizedAddress);
    const added = !before.includes(normalizedAddress);
    await writeSecurityAuditLog({
      eventType: 'admin_owners_manage',
      result: 'success',
      address: auth.session?.address ?? null,
      ipAddress: auth.requestIp,
      actorPurpose: auth.session?.purpose ?? null,
      metadata: {
        action: 'add',
        mode: auth.authMode,
        targetAddress: normalizedAddress,
        added,
      },
    });
    return Response.json(
      {
        ok: true,
        added,
        adminWalletAddress: updatedAdminWalletAddresses[0] ?? null,
        adminWalletAddresses: updatedAdminWalletAddresses,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    await writeSecurityAuditLog({
      eventType: 'admin_owners_manage',
      result: 'failure',
      address: auth.session?.address ?? null,
      ipAddress: auth.requestIp,
      actorPurpose: auth.session?.purpose ?? null,
      metadata: {
        action: 'add',
        mode: auth.authMode,
        targetAddress: normalizedAddress,
        reason: error instanceof Error ? error.message : 'add_failed',
      },
    });
    console.error('[admin admins POST]', error);
    return Response.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await assertAuthorizedAdminRequest(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = UpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const normalizedAddress = normalizeWalletAddress(parsed.data.address);
  if (!normalizedAddress) {
    return Response.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    const before = await getAdminWalletAddresses();
    if (!before.includes(normalizedAddress)) {
      return Response.json(
        {
          ok: true,
          removed: false,
          adminWalletAddress: before[0] ?? null,
          adminWalletAddresses: before,
        },
        {
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }
    if (before.length <= 1) {
      return Response.json(
        { error: 'Cannot remove the last admin address' },
        {
          status: 409,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    const updatedAdminWalletAddresses = await removeAdminWalletAddress(normalizedAddress);
    const removed = !updatedAdminWalletAddresses.includes(normalizedAddress);
    if (removed) {
      await revokeWalletAuthSessionsByAddress(normalizedAddress, 'admin');
    }

    await writeSecurityAuditLog({
      eventType: 'admin_owners_manage',
      result: 'success',
      address: auth.session?.address ?? null,
      ipAddress: auth.requestIp,
      actorPurpose: auth.session?.purpose ?? null,
      metadata: {
        action: 'remove',
        mode: auth.authMode,
        targetAddress: normalizedAddress,
        removed,
      },
    });

    const unchanged = sameAddresses(before, updatedAdminWalletAddresses);
    return Response.json(
      {
        ok: true,
        removed: removed && !unchanged,
        adminWalletAddress: updatedAdminWalletAddresses[0] ?? null,
        adminWalletAddresses: updatedAdminWalletAddresses,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    await writeSecurityAuditLog({
      eventType: 'admin_owners_manage',
      result: 'failure',
      address: auth.session?.address ?? null,
      ipAddress: auth.requestIp,
      actorPurpose: auth.session?.purpose ?? null,
      metadata: {
        action: 'remove',
        mode: auth.authMode,
        targetAddress: normalizedAddress,
        reason: error instanceof Error ? error.message : 'remove_failed',
      },
    });
    console.error('[admin admins DELETE]', error);
    return Response.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
