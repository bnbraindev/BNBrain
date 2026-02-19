import { z } from 'zod';
import {
  addAdminWalletAddress,
  getAdminWalletAddresses,
  isAdminWalletAddress,
  normalizeWalletAddress,
  removeAdminWalletAddress,
} from '@/lib/server/admin-owner';
import {
  getWalletAuthSessionFromRequest,
  revokeWalletAuthSessionsByAddress,
} from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';
import { writeSecurityAuditLog } from '@/lib/server/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TransferBodySchema = z.object({
  nextAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(req: Request) {
  const rateLimitIp = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `admin:transfer:ip:${rateLimitIp}`, limit: 5, windowMs: 3600_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many transfer attempts' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = TransferBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const requestIp = getRequestIpAddress(req);
  const session = await getWalletAuthSessionFromRequest(req);
  if (!session) {
    await writeSecurityAuditLog({
      eventType: 'admin_transfer',
      result: 'denied',
      ipAddress: requestIp,
      metadata: {
        reason: 'missing_session',
      },
    });
    return Response.json({ error: 'Wallet session required' }, { status: 401 });
  }
  const currentAdminWalletAddresses = await getAdminWalletAddresses();
  if (currentAdminWalletAddresses.length === 0) {
    await writeSecurityAuditLog({
      eventType: 'admin_transfer',
      result: 'denied',
      address: session.address,
      ipAddress: requestIp,
      actorPurpose: session.purpose,
      metadata: {
        reason: 'no_admin_bound',
      },
    });
    return Response.json({ error: 'No admin wallet is currently bound' }, { status: 409 });
  }
  const actorIsAdmin = await isAdminWalletAddress(session.address);
  if (!actorIsAdmin) {
    await writeSecurityAuditLog({
      eventType: 'admin_transfer',
      result: 'denied',
      address: session.address,
      ipAddress: requestIp,
      actorPurpose: session.purpose,
      metadata: {
        reason: 'not_current_admin',
        currentAdminWalletAddresses,
      },
    });
    return Response.json(
      { error: 'Only an existing admin can transfer admin ownership' },
      { status: 403 }
    );
  }
  const nextAdminWalletAddress = normalizeWalletAddress(parsed.data.nextAddress);
  if (!nextAdminWalletAddress) {
    return Response.json({ error: 'Invalid next wallet address' }, { status: 400 });
  }
  try {
    const withNext = await addAdminWalletAddress(nextAdminWalletAddress);
    const shouldDropActor = session.address !== nextAdminWalletAddress;
    const updatedAdminWalletAddresses = shouldDropActor
      ? await removeAdminWalletAddress(session.address)
      : withNext;
    const updatedAdminWalletAddress = updatedAdminWalletAddresses[0] ?? null;
    if (shouldDropActor) {
      await revokeWalletAuthSessionsByAddress(session.address, 'admin');
    }
    await writeSecurityAuditLog({
      eventType: 'admin_transfer',
      result: 'success',
      address: session.address,
      ipAddress: requestIp,
      actorPurpose: session.purpose,
      metadata: {
        previousAdminWalletAddress: session.address,
        adminWalletAddress: updatedAdminWalletAddress,
        adminWalletAddresses: updatedAdminWalletAddresses,
      },
    });
    return Response.json(
      {
        ok: true,
        previousAdminWalletAddress: session.address,
        adminWalletAddress: updatedAdminWalletAddress,
        adminWalletAddresses: updatedAdminWalletAddresses,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    await writeSecurityAuditLog({
      eventType: 'admin_transfer',
      result: 'failure',
      address: session.address,
      ipAddress: requestIp,
      actorPurpose: session.purpose,
      metadata: {
        reason: error instanceof Error ? error.message : 'transfer_failed',
      },
    });
    console.error('[admin transfer POST]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
