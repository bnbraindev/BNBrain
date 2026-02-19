import { createUIMessageStreamResponse } from 'ai';
import {
  ChatOwnerSchema,
  type ChatOwner,
} from '@/lib/server/chat-runtime';
import { createChatRunUIMessageStream } from '@/lib/server/chat-run-stream';
import { getActiveChatRunByChatOwner } from '@/lib/server/chat-run-store';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readOwnerFromHeaders(req: Request): ChatOwner | null {
  const ownerTypeHeader = req.headers.get('x-bnb-owner-type');
  const ownerIdHeader = req.headers.get('x-bnb-owner-id');
  if (!ownerTypeHeader || !ownerIdHeader) return null;
  const parsed = ChatOwnerSchema.safeParse({
    ownerType: ownerTypeHeader,
    ownerId: ownerIdHeader,
  });
  if (!parsed.success) return null;
  return parsed.data;
}

async function resolveReconnectOwner(
  req: Request,
  chatId: string
): Promise<ChatOwner | null> {
  const headerOwner = readOwnerFromHeaders(req);
  if (headerOwner) {
    return {
      ownerType: headerOwner.ownerType,
      ownerId:
        headerOwner.ownerType === 'wallet'
          ? headerOwner.ownerId.toLowerCase()
          : headerOwner.ownerId,
    };
  }
  const session = await getWalletAuthSessionFromRequest(req);
  if (session) {
    return {
      ownerType: 'wallet',
      ownerId: session.address,
    };
  }
  return {
    ownerType: 'guest',
    ownerId: `legacy:${chatId}`,
  };
}

async function assertOwnerAuthorized(
  req: Request,
  owner: ChatOwner
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

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getRequestIpAddress(req);
    const rl = await checkRateLimit({ key: `stream-reconnect:ip:${ip}`, limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
      return Response.json({ error: 'Too many requests' }, { status: 429 });
    }
    const { id: chatId } = await context.params;
    const owner = await resolveReconnectOwner(req, chatId);
    if (!owner) {
      return Response.json(
        { error: 'Missing owner context for reconnect' },
        { status: 400 }
      );
    }
    const authError = await assertOwnerAuthorized(req, owner);
    if (authError) return authError;

    const run = await getActiveChatRunByChatOwner(chatId, owner);
    if (!run) {
      return new Response(null, { status: 204 });
    }

    const afterSeqHeader = req.headers.get('x-bnb-after-seq');
    const afterSeq = afterSeqHeader ? Math.max(0, parseInt(afterSeqHeader, 10) || 0) : 0;

    return createUIMessageStreamResponse({
      headers: {
        'Cache-Control': 'no-store',
      },
      stream: createChatRunUIMessageStream(run.id, { afterSeq }),
    });
  } catch (error) {
    console.error('[chat stream reconnect GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
