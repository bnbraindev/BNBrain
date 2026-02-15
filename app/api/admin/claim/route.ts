import { z } from 'zod';
import {
  bindInitialAdminWalletAddress,
  getAdminWalletAddresses,
  normalizeWalletAddress,
} from '@/lib/server/admin-owner';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';
import { writeSecurityAuditLog } from '@/lib/server/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ClaimBodySchema = z.object({
  address: z.string().min(1),
});

export async function POST(req: Request) {
  const requestIp = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `admin:claim:ip:${requestIp}`, limit: 5, windowMs: 3600_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many claim attempts' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = ClaimBodySchema.safeParse(body);
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
  const session = await getWalletAuthSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Wallet session required' }, { status: 401 });
  }
  if (session.address !== normalizedAddress) {
    return Response.json({ error: 'Wallet session does not match address' }, { status: 403 });
  }
  try {
    const adminWalletAddress = await bindInitialAdminWalletAddress(normalizedAddress);
    const adminWalletAddresses = await getAdminWalletAddresses();
    const isAdmin = adminWalletAddresses.includes(normalizedAddress);
    await writeSecurityAuditLog({
      eventType: 'admin_claim',
      address: normalizedAddress,
      ipAddress: requestIp,
      result: isAdmin ? 'success' : 'no_effect',
      metadata: { adminWalletAddress },
    });
    return Response.json({
      ok: true,
      adminWalletAddress,
      adminWalletAddresses,
      isAdmin,
    });
  } catch (error) {
    console.error('[admin claim POST]', error);
    await writeSecurityAuditLog({
      eventType: 'admin_claim',
      address: normalizedAddress,
      ipAddress: requestIp,
      result: 'error',
      metadata: { error: String(error) },
    }).catch(() => {});
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
