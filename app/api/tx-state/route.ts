import { z } from 'zod';
import { TX_STATUS_VALUES } from '@/lib/tx/state';
import {
  getTxRecord,
  listTxRecords,
  upsertTxRecord,
} from '@/lib/server/tx-state-store';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { getConversationByOwnerAndId } from '@/lib/server/conversation-store';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

/**
 * Resolve owner identity from request headers.
 * Returns null only if headers are completely missing (e.g. legacy clients).
 */
function readOwnerFromHeaders(req: Request): {
  ownerType: 'wallet' | 'guest';
  ownerId: string;
} | null {
  const ownerType = req.headers.get('x-bnb-owner-type');
  const ownerId = req.headers.get('x-bnb-owner-id');
  if (!ownerType || !ownerId) return null;
  if (ownerType !== 'wallet' && ownerType !== 'guest') return null;
  return { ownerType, ownerId };
}

/**
 * Verify wallet owner has a valid SIWE session matching their claimed identity.
 */
async function assertOwnerAuthorized(
  req: Request,
  owner: { ownerType: 'wallet' | 'guest'; ownerId: string }
): Promise<Response | null> {
  if (owner.ownerType !== 'wallet') return null;
  const session = await getWalletAuthSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Wallet session required' }, { status: 401 });
  }
  if (session.address !== owner.ownerId.toLowerCase()) {
    return Response.json(
      { error: 'Wallet session does not match owner' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Verify the conversationId belongs to the requesting owner.
 * Prevents cross-conversation tx-state access.
 */
async function assertConversationOwnership(
  owner: { ownerType: 'wallet' | 'guest'; ownerId: string },
  conversationId: string
): Promise<Response | null> {
  const conversation = await getConversationByOwnerAndId(
    { ownerType: owner.ownerType, ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId },
    conversationId
  );
  if (!conversation) {
    return Response.json(
      { error: 'Conversation not found or not owned by this user' },
      { status: 403 }
    );
  }
  return null;
}

const TxStateUpsertSchema = z.object({
  conversationId: z.string().min(1).max(120),
  txKey: z.string().min(1).max(180),
  status: z.enum(TX_STATUS_VALUES),
  hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/, 'hash must be hex')
    .optional(),
  chainId: z.number().int().positive().optional(),
  error: z.string().max(500).optional(),
  errorDetails: z.string().max(5000).optional(),
  updatedAt: z.number().int().positive().optional(),
});

export async function GET(req: Request) {
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `tx-state:ip:${ip}`, limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const owner = readOwnerFromHeaders(req);
  if (!owner) {
    return Response.json({ error: 'Owner identity is required' }, { status: 400 });
  }
  const authError = await assertOwnerAuthorized(req, owner);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');
  const txKey = searchParams.get('txKey');

  if (!conversationId) {
    return Response.json(
      { error: 'conversationId is required' },
      { status: 400 }
    );
  }

  const ownershipError = await assertConversationOwnership(owner, conversationId);
  if (ownershipError) return ownershipError;

  try {
    if (txKey) {
      const record = await getTxRecord(conversationId, txKey);
      return Response.json({ record });
    }

    const records = await listTxRecords(conversationId);
    return Response.json({ records });
  } catch (error) {
    console.error('[tx-state GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ip = getRequestIpAddress(req);
  const rlPost = await checkRateLimit({ key: `tx-state:ip:${ip}`, limit: 60, windowMs: 60_000 });
  if (!rlPost.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const owner = readOwnerFromHeaders(req);
  if (!owner) {
    return Response.json({ error: 'Owner identity is required' }, { status: 400 });
  }
  const authError = await assertOwnerAuthorized(req, owner);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = TxStateUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const ownershipError = await assertConversationOwnership(owner, parsed.data.conversationId);
  if (ownershipError) return ownershipError;

  try {
    const record = await upsertTxRecord({
      ...parsed.data,
      hash: parsed.data.hash as `0x${string}` | undefined,
    });
    return Response.json({ record });
  } catch (error) {
    console.error('[tx-state POST]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
