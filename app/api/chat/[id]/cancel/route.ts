import { z } from 'zod';
import {
  ChatOwnerSchema,
  type ChatOwner,
} from '@/lib/server/chat-runtime';
import {
  getActiveChatRunByChatOwner,
  requestChatRunCancellation,
} from '@/lib/server/chat-run-store';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CancelBodySchema = z.object({
  owner: ChatOwnerSchema.optional(),
});

function normalizeOwner(owner: ChatOwner): ChatOwner {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
  };
}

function readOwnerFromHeaders(req: Request): ChatOwner | null {
  const ownerTypeHeader = req.headers.get('x-bnb-owner-type');
  const ownerIdHeader = req.headers.get('x-bnb-owner-id');
  if (!ownerTypeHeader || !ownerIdHeader) return null;
  const parsed = ChatOwnerSchema.safeParse({
    ownerType: ownerTypeHeader,
    ownerId: ownerIdHeader,
  });
  if (!parsed.success) return null;
  return normalizeOwner(parsed.data);
}

async function resolveOwner(
  req: Request,
  chatId: string,
  bodyOwner?: ChatOwner
): Promise<ChatOwner> {
  if (bodyOwner) return normalizeOwner(bodyOwner);
  const headerOwner = readOwnerFromHeaders(req);
  if (headerOwner) return headerOwner;
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

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await context.params;
  let ownerFromBody: ChatOwner | undefined;
  try {
    const rawBody = await req.json();
    const parsedBody = CancelBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return Response.json(
        { error: 'Invalid request body', details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }
    ownerFromBody = parsedBody.data.owner;
  } catch {
    // Accept empty body and resolve owner from headers/session.
  }

  const owner = await resolveOwner(req, chatId, ownerFromBody);
  const authError = await assertOwnerAuthorized(req, owner);
  if (authError) return authError;

  const run = await getActiveChatRunByChatOwner(chatId, owner);
  if (!run) {
    return Response.json(
      { ok: true, cancelled: false, reason: 'no_active_run' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  await requestChatRunCancellation(run.id);
  return Response.json(
    { ok: true, cancelled: true, runId: run.id },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
