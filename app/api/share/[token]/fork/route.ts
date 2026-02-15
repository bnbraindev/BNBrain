import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  getConversationByShareToken,
  upsertConversation,
  type ConversationOwner,
} from '@/lib/server/conversation-store';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import type { Conversation } from '@/lib/stores/chat-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ShareTokenSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9-]+$/, 'Invalid share token format');

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

const ForkRequestSchema = z.object({
  owner: OwnerSchema,
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

export async function POST(
  req: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await context.params;
  const parsedToken = ShareTokenSchema.safeParse(rawToken);
  if (!parsedToken.success) {
    return Response.json({ error: 'Share link not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedBody = ForkRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsedBody.error.flatten() },
      { status: 400 }
    );
  }

  const owner = normalizeOwner(parsedBody.data.owner);
  const authError = await assertWalletOwnerAuthorized(req, owner);
  if (authError) return authError;

  try {
    const sourceConversation = await getConversationByShareToken(parsedToken.data);
    if (!sourceConversation || !sourceConversation.isShared) {
      return Response.json({ error: 'Share link not found' }, { status: 404 });
    }

    const now = Date.now();
    const forkConversationId = randomUUID().toLowerCase();
    const forkConversation: Conversation = {
      ...sourceConversation,
      id: forkConversationId,
      walletAddress: owner.ownerType === 'wallet' ? owner.ownerId : undefined,
      isStarred: false,
      isShared: false,
      sharedAt: undefined,
      shareToken: undefined,
      shareExpiresAt: undefined,
      forkedFromShareToken: sourceConversation.shareToken,
      scope: owner.ownerType === 'wallet' ? 'wallet' : 'guest',
      contextInjectionStatus: owner.ownerType === 'wallet' ? 'pending' : 'not_injected',
      contextFingerprint: undefined,
      contextInjectedAt: undefined,
      createdAt: now,
      updatedAt: now,
      messages: sourceConversation.messages.map((message) => ({
        ...message,
        parts: message.parts ? [...message.parts] : undefined,
      })),
    };

    await upsertConversation(owner, forkConversation);

    return Response.json({
      conversationId: forkConversationId,
      conversation: forkConversation,
    });
  } catch (error) {
    console.error('[share fork POST]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
