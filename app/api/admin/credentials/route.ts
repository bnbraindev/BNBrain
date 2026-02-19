import { z } from 'zod';
import {
  createAdminCredential,
  deleteAdminCredential,
  changeAdminCredentialPassword,
  hasAnyAdminCredentials,
  listAdminCredentialUsernames,
} from '@/lib/server/admin-password';
import { getAdminAuthContext, readBearerToken } from '@/lib/server/admin-auth';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { getAdminWalletAddresses } from '@/lib/server/admin-owner';
import { getRequestIpAddress } from '@/lib/server/rate-limit';
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

/**
 * Check if this is an initial setup scenario (no admin credentials and no admin wallets).
 * During initial setup, credential creation is allowed without authentication.
 */
async function isInitialSetup(): Promise<boolean> {
  const [hasCredentials, walletAddresses] = await Promise.all([
    hasAnyAdminCredentials(),
    getAdminWalletAddresses(),
  ]);
  return !hasCredentials && walletAddresses.length === 0;
}

async function assertAdminOrInitialSetup(req: Request): Promise<
  | { ok: true; isSetup: boolean; requestIp: string }
  | { ok: false; response: Response }
> {
  const requestIp = getRequestIpAddress(req);
  const initialSetup = await isInitialSetup();
  if (initialSetup) {
    return { ok: true, isSetup: true, requestIp };
  }

  const token = resolveToken(req);
  const session = await getWalletAuthSessionFromRequest(req);
  const authContext = await getAdminAuthContext(
    token,
    session?.address ?? null,
    session?.purpose ?? null
  );

  if (!authContext.authorized) {
    await writeSecurityAuditLog({
      eventType: 'admin_credentials_manage',
      result: 'denied',
      ipAddress: requestIp,
      metadata: { reason: 'unauthorized' },
    });
    return {
      ok: false,
      response: Response.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }

  return { ok: true, isSetup: false, requestIp };
}

// GET — list usernames
export async function GET(req: Request) {
  const auth = await assertAdminOrInitialSetup(req);
  if (!auth.ok) return auth.response;

  try {
    const usernames = await listAdminCredentialUsernames();
    return Response.json(
      { ok: true, usernames },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[admin credentials GET]', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

const CreateBodySchema = z.object({
  username: z.string().min(2).max(100),
  password: z.string().min(8).max(256),
});

// POST — create credential
export async function POST(req: Request) {
  const auth = await assertAdminOrInitialSetup(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await createAdminCredential(parsed.data.username, parsed.data.password);
    await writeSecurityAuditLog({
      eventType: 'admin_credentials_manage',
      result: 'success',
      ipAddress: auth.requestIp,
      metadata: {
        action: 'create',
        username: parsed.data.username.trim().toLowerCase(),
        isSetup: auth.isSetup,
      },
    });
    return Response.json(
      { ok: true, username: parsed.data.username.trim().toLowerCase() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create credential' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

const PatchBodySchema = z.object({
  username: z.string().min(2).max(100),
  newPassword: z.string().min(8).max(256),
});

// PATCH — change password
export async function PATCH(req: Request) {
  const auth = await assertAdminOrInitialSetup(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const changed = await changeAdminCredentialPassword(
      parsed.data.username,
      parsed.data.newPassword
    );
    if (!changed) {
      return Response.json(
        { error: 'Username not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    await writeSecurityAuditLog({
      eventType: 'admin_credentials_manage',
      result: 'success',
      ipAddress: auth.requestIp,
      metadata: {
        action: 'change_password',
        username: parsed.data.username.trim().toLowerCase(),
      },
    });
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to change password' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

const DeleteBodySchema = z.object({
  username: z.string().min(1).max(100),
});

// DELETE — delete credential
export async function DELETE(req: Request) {
  const auth = await assertAdminOrInitialSetup(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const deleted = await deleteAdminCredential(parsed.data.username);
    await writeSecurityAuditLog({
      eventType: 'admin_credentials_manage',
      result: 'success',
      ipAddress: auth.requestIp,
      metadata: {
        action: 'delete',
        username: parsed.data.username.trim().toLowerCase(),
        deleted,
      },
    });
    return Response.json(
      { ok: true, deleted },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to delete credential' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
