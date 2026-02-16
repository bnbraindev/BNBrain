import { z } from 'zod';
import { getConversationByShareToken } from '@/lib/server/conversation-store';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ShareTokenSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9-]+$/, 'Invalid share token format');

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> }
) {
  const ip = getRequestIpAddress(_req);
  const rl = await checkRateLimit({ key: `share-get:ip:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  const { token: rawToken } = await context.params;
  const parsedToken = ShareTokenSchema.safeParse(rawToken);
  if (!parsedToken.success) {
    return Response.json({ error: 'Share link not found' }, { status: 404 });
  }

  try {
    const conversation = await getConversationByShareToken(parsedToken.data);
    if (!conversation || !conversation.isShared || !conversation.shareToken) {
      return Response.json({ error: 'Share link not found' }, { status: 404 });
    }
    // Strip sensitive fields before returning to public viewers
    const { walletAddress, shareToken, forkedFromShareToken, contextFingerprint, contextInjectedAt, contextInjectionStatus, ...safeConversation } = conversation;
    return Response.json({ conversation: safeConversation });
  } catch (error) {
    console.error('[share GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
