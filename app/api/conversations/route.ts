import { z } from 'zod';
import {
  ConversationOwnershipConflictError,
  deleteConversationByOwner,
  listConversationsByOwner,
  upsertConversation,
  type ConversationOwner,
} from '@/lib/server/conversation-store';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

const OwnerSchema = z.object({
  ownerType: z.enum(['wallet', 'guest']),
  ownerId: z.string().min(1).max(120),
}).refine(
  (o) => {
    if (o.ownerType === 'wallet') return /^0x[0-9a-fA-F]{40}$/.test(o.ownerId);
    return o.ownerId.length >= 6;
  },
  { message: 'Invalid ownerId format for the given ownerType' }
);

const StoredMessageSchema = z.object({
  id: z.string().min(1).max(160),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  parts: z
    .array(
      z.object({
        type: z.string(),
      }).catchall(z.any())
    )
    .optional(),
  createdAt: z.number().optional(),
});

const ConversationSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  messages: z.array(StoredMessageSchema),
  walletAddress: z.string().optional(),
  isStarred: z.boolean().optional().default(false),
  isShared: z.boolean().optional().default(false),
  sharedAt: z.number().optional(),
  shareToken: z.string().min(1).max(120).optional(),
  shareExpiresAt: z.number().optional(),
  forkedFromShareToken: z.string().min(1).max(120).optional(),
  scope: z.enum(['guest', 'wallet']),
  contextInjectionStatus: z.enum(['not_injected', 'pending', 'injected', 'stale']),
  contextFingerprint: z.string().optional(),
  contextInjectedAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const UpsertBodySchema = z.object({
  owner: OwnerSchema,
  conversation: ConversationSchema,
});

const DeleteBodySchema = z.object({
  owner: OwnerSchema,
  conversationId: z.string().min(1).max(120),
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

/**
 * Validate that the conversation's scope and walletAddress are consistent
 * with the claimed owner to prevent cross-user data injection.
 */
function validateOwnership(
  owner: ConversationOwner,
  conversation: z.infer<typeof ConversationSchema>
): string | null {
  if (owner.ownerType === 'wallet') {
    if (conversation.scope !== 'wallet') {
      return 'wallet owner cannot upsert guest-scope conversations';
    }
    if (
      conversation.walletAddress &&
      conversation.walletAddress.toLowerCase() !== owner.ownerId.toLowerCase()
    ) {
      return 'conversation walletAddress does not match owner';
    }
  } else {
    if (conversation.scope !== 'guest') {
      return 'guest owner cannot upsert wallet-scope conversations';
    }
  }
  return null;
}

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `conversations:ip:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const { searchParams } = new URL(req.url);
  const ownerType = searchParams.get('ownerType');
  const ownerId = searchParams.get('ownerId');
  if (!ownerType || !ownerId) {
    return Response.json(
      { error: 'ownerType and ownerId are required' },
      { status: 400 }
    );
  }
  const parsedOwner = OwnerSchema.safeParse({ ownerType, ownerId });
  if (!parsedOwner.success) {
    return Response.json(
      { error: 'Invalid owner info', details: parsedOwner.error.flatten() },
      { status: 400 }
    );
  }
  const owner = normalizeOwner(parsedOwner.data);
  const authError = await assertWalletOwnerAuthorized(req, owner);
  if (authError) return authError;

  // Optional projectId filter
  const projectId = searchParams.get('projectId') || undefined;

  try {
    const conversations = await listConversationsByOwner(owner, { projectId });
    return Response.json({ conversations });
  } catch (error) {
    console.error('[conversations GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const postIp = getRequestIpAddress(req);
  const postRl = await checkRateLimit({ key: `conversations:post:ip:${postIp}`, limit: 30, windowMs: 60_000 });
  if (!postRl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = UpsertBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const owner = normalizeOwner(parsed.data.owner);
  const authError = await assertWalletOwnerAuthorized(req, owner);
  if (authError) return authError;
  const ownershipError = validateOwnership(owner, parsed.data.conversation);
  if (ownershipError) {
    return Response.json({ error: ownershipError }, { status: 403 });
  }

  try {
    await upsertConversation(owner, parsed.data.conversation);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ConversationOwnershipConflictError) {
      return Response.json(
        { error: 'Conversation ID ownership conflict' },
        { status: 409 }
      );
    }
    console.error('[conversations POST]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const delIp = getRequestIpAddress(req);
  const delRl = await checkRateLimit({ key: `conversations:del:ip:${delIp}`, limit: 20, windowMs: 60_000 });
  if (!delRl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
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
  const owner = normalizeOwner(parsed.data.owner);
  const authError = await assertWalletOwnerAuthorized(req, owner);
  if (authError) return authError;
  try {
    await deleteConversationByOwner(owner, parsed.data.conversationId);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[conversations DELETE]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
