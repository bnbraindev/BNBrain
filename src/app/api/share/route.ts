import { z } from 'zod';
import {
  clearConversationShareToken,
  ensureConversationShareToken,
  getConversationByOwnerAndId,
  type ConversationOwner,
} from '@/lib/server/conversation-store';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OwnerSchema = z
  .object({
    ownerType: z.enum(['wallet', 'guest']),
    ownerId: z.string().min(1).max(120),
  })
  .refine(
    (owner) => {
      if (owner.ownerType === 'wallet') return /^0x[0-9a-fA-F]{40}$/.test(owner.ownerId);
      return owner.ownerId.length >= 6;
    },
    { message: 'Invalid ownerId format for the given ownerType' }
  );

const ShareUpdateSchema = z.object({
  owner: OwnerSchema,
  conversationId: z.string().min(1).max(120),
  expiresAt: z.number().int().positive().nullable().optional(),
});

function normalizeOwner(owner: ConversationOwner): ConversationOwner {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
  };
}

async function assertWalletOwnerAuthorized(
  req: Request,
  owner: ConversationOwner
): Promise<Response | null> {
  if (owner.ownerType !== 'wallet') return null;
  const session = await getWalletAuthSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Wallet session required' }, { status: 401 });
  }
  if (session.address !== owner.ownerId.toLowerCase()) {
    return Response.json({ error: 'Wallet session does not match owner' }, { status: 403 });
  }
  return null;
}

async function parseBody(req: Request): Promise<
  | { owner: ConversationOwner; conversationId: string; expiresAt?: number | null }
  | { errorResponse: Response }
> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { errorResponse: Response.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
  const parsed = ShareUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return {
      errorResponse: Response.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return {
    owner: normalizeOwner(parsed.data.owner),
    conversationId: parsed.data.conversationId,
    expiresAt:
      parsed.data.expiresAt === undefined ? undefined : parsed.data.expiresAt,
  };
}

export async function POST(req: Request) {
  const postIp = getRequestIpAddress(req);
  const postRl = await checkRateLimit({ key: `share:post:ip:${postIp}`, limit: 15, windowMs: 60_000 });
  if (!postRl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const parsed = await parseBody(req);
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const authError = await assertWalletOwnerAuthorized(req, parsed.owner);
  if (authError) return authError;
  if (
    typeof parsed.expiresAt === 'number' &&
    Number.isFinite(parsed.expiresAt) &&
    parsed.expiresAt <= Date.now()
  ) {
    return Response.json(
      { error: 'expiresAt must be in the future' },
      { status: 400 }
    );
  }

  try {
    const shareToken = await ensureConversationShareToken(
      parsed.owner,
      parsed.conversationId,
      parsed.expiresAt
    );
    if (!shareToken) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
    const conversation = await getConversationByOwnerAndId(parsed.owner, parsed.conversationId);
    return Response.json({
      ok: true,
      shareToken,
      sharedAt: conversation?.sharedAt ?? Date.now(),
      shareExpiresAt: conversation?.shareExpiresAt,
      isShared: true,
    });
  } catch (error) {
    console.error('[share POST]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const delIp = getRequestIpAddress(req);
  const delRl = await checkRateLimit({ key: `share:del:ip:${delIp}`, limit: 15, windowMs: 60_000 });
  if (!delRl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const parsed = await parseBody(req);
  if ('errorResponse' in parsed) return parsed.errorResponse;
  const authError = await assertWalletOwnerAuthorized(req, parsed.owner);
  if (authError) return authError;

  try {
    const cleared = await clearConversationShareToken(parsed.owner, parsed.conversationId);
    if (!cleared) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
    return Response.json({ ok: true, isShared: false });
  } catch (error) {
    console.error('[share DELETE]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
