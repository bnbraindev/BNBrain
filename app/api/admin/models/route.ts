import { z } from 'zod';
import {
  createChatModel,
  deleteChatModel,
  listAdminChatModels,
  setChatModelActive,
  setDefaultChatModel,
  updateChatModel,
} from '@/lib/server/chat-model-store';
import { getAdminAuthContext, readBearerToken } from '@/lib/server/admin-auth';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { getRequestIpAddress } from '@/lib/server/rate-limit';
import { writeSecurityAuditLog } from '@/lib/server/security-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateBodySchema = z.object({
  displayName: z.string().min(1).max(80),
  protocol: z.enum(['anthropic', 'openai']),
  baseUrl: z.string().min(1).max(240),
  providerModelId: z.string().min(1).max(120),
  apiKey: z.string().min(1).max(400),
  authMode: z.enum(['x-api-key', 'bearer']).optional(),
  active: z.boolean().optional(),
  makeDefault: z.boolean().optional(),
});

const UpdateBodySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(80).optional(),
  protocol: z.enum(['anthropic', 'openai']).optional(),
  baseUrl: z.string().min(1).max(240).optional(),
  providerModelId: z.string().min(1).max(120).optional(),
  apiKey: z.string().min(1).max(400).optional(),
  authMode: z.enum(['x-api-key', 'bearer']).optional(),
  active: z.boolean().optional(),
  makeDefault: z.boolean().optional(),
});

const PatchBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set-active'),
    id: z.string().uuid(),
    active: z.boolean(),
  }),
  z.object({
    action: z.literal('set-default'),
    id: z.string().uuid(),
  }),
]);

const DeleteBodySchema = z.object({
  id: z.string().uuid(),
});

function resolveToken(req: Request): string | null {
  const authToken = readBearerToken(req.headers.get('authorization'));
  if (authToken) return authToken;
  const { searchParams } = new URL(req.url);
  const queryToken = searchParams.get('token');
  return queryToken?.trim() || null;
}

function statusForErrorMessage(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes('not found')) return 404;
  if (
    lower.includes('at least one active') ||
    lower.includes('default model must be active')
  ) {
    return 409;
  }
  return 400;
}

async function assertAuthorizedAdminRequest(req: Request): Promise<
  | {
      ok: true;
      token: string | null;
      authMode: 'token' | 'wallet';
      session: Awaited<ReturnType<typeof getWalletAuthSessionFromRequest>>;
      requestIp: string;
    }
  | { ok: false; response: Response }
> {
  const token = resolveToken(req);
  const session = await getWalletAuthSessionFromRequest(req);
  const requestIp = getRequestIpAddress(req);
  const authContext = await getAdminAuthContext(token, session?.address ?? null);
  const authMode: 'token' | 'wallet' = token ? 'token' : 'wallet';

  if (!authContext.authorized) {
    await writeSecurityAuditLog({
      eventType: 'admin_models_manage',
      result: 'denied',
      address: session?.address ?? null,
      ipAddress: requestIp,
      actorPurpose: session?.purpose ?? null,
      metadata: {
        reason: 'unauthorized',
        mode: authMode,
      },
    });
    return {
      ok: false,
      response: Response.json(
        {
          error: 'Unauthorized',
          mode: authMode,
          tokenConfigured: authContext.tokenConfigured,
        },
        {
          status: 401,
          headers: { 'Cache-Control': 'no-store' },
        }
      ),
    };
  }

  if (!token && !session) {
    await writeSecurityAuditLog({
      eventType: 'admin_models_manage',
      result: 'denied',
      address: null,
      ipAddress: requestIp,
      actorPurpose: null,
      metadata: {
        reason: 'wallet_session_required',
        mode: authMode,
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
    authMode,
    session,
    requestIp,
  };
}

export async function GET(req: Request) {
  const auth = await assertAuthorizedAdminRequest(req);
  if (!auth.ok) return auth.response;
  try {
    const result = await listAdminChatModels();
    await writeSecurityAuditLog({
      eventType: 'admin_models_manage',
      result: 'success',
      address: auth.session?.address ?? null,
      ipAddress: auth.requestIp,
      actorPurpose: auth.session?.purpose ?? null,
      metadata: {
        action: 'list',
        mode: auth.authMode,
        modelCount: result.models.length,
      },
    });
    return Response.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('[admin models GET]', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
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
  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await createChatModel(parsed.data);
    await writeSecurityAuditLog({
      eventType: 'admin_models_manage',
      result: 'success',
      address: auth.session?.address ?? null,
      ipAddress: auth.requestIp,
      actorPurpose: auth.session?.purpose ?? null,
      metadata: {
        action: 'create',
        mode: auth.authMode,
        modelId: result.model.id,
        protocol: result.model.protocol,
      },
    });
    return Response.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create model';
    return Response.json(
      { error: message },
      {
        status: statusForErrorMessage(message),
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}

export async function PUT(req: Request) {
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

  try {
    const result = await updateChatModel(parsed.data);
    await writeSecurityAuditLog({
      eventType: 'admin_models_manage',
      result: 'success',
      address: auth.session?.address ?? null,
      ipAddress: auth.requestIp,
      actorPurpose: auth.session?.purpose ?? null,
      metadata: {
        action: 'update',
        mode: auth.authMode,
        modelId: result.model.id,
      },
    });
    return Response.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update model';
    return Response.json(
      { error: message },
      {
        status: statusForErrorMessage(message),
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}

export async function PATCH(req: Request) {
  const auth = await assertAuthorizedAdminRequest(req);
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
    if (parsed.data.action === 'set-active') {
      const result = await setChatModelActive(parsed.data.id, parsed.data.active);
      return Response.json(
        {
          ok: true,
          ...result,
        },
        {
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }
    const result = await setDefaultChatModel(parsed.data.id);
    return Response.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update model state';
    return Response.json(
      { error: message },
      {
        status: statusForErrorMessage(message),
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
  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await deleteChatModel(parsed.data.id);
    return Response.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete model';
    return Response.json(
      { error: message },
      {
        status: statusForErrorMessage(message),
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
