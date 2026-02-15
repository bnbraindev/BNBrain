import { createUIMessageStreamResponse } from 'ai';
import { apiErrorResponse } from '@/lib/errors/api-error';
import {
  ChatOwnerSchema,
  ChatRequestSchema,
  normalizeOwnerFromRequest,
  toModelMessages,
} from '@/lib/server/chat-runtime';
import { createChatRunUIMessageStream } from '@/lib/server/chat-run-stream';
import {
  createChatRun,
  getActiveChatRunByChatOwner,
  getAnyNonTerminalChatRunByChatOwner,
} from '@/lib/server/chat-run-store';
import { ensureChatRunWorkerStarted } from '@/lib/server/chat-run-worker';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const maxDuration = 60;

export const runtime = 'nodejs';

async function assertOwnerAuthorized(
  req: Request,
  owner: { ownerType: 'wallet' | 'guest'; ownerId: string }
): Promise<Response | null> {
  if (owner.ownerType !== 'wallet') return null;
  const session = await getWalletAuthSessionFromRequest(req);
  if (!session) {
    return apiErrorResponse(
      {
        code: 'UNAUTHORIZED',
        message: 'Wallet session required',
        retryable: false,
      },
      401
    );
  }
  if (session.address !== owner.ownerId.toLowerCase()) {
    return apiErrorResponse(
      {
        code: 'FORBIDDEN',
        message: 'Wallet session does not match owner',
        retryable: false,
      },
      403
    );
  }
  return null;
}

export async function POST(req: Request) {
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `chat:ip:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return apiErrorResponse(
      { code: 'RATE_LIMITED', message: 'Too many requests. Please retry shortly.', retryable: true },
      429
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErrorResponse(
      {
        code: 'INVALID_JSON',
        message: 'Invalid JSON body',
        retryable: false,
      },
      400
    );
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiErrorResponse(
      {
        code: 'INVALID_REQUEST_BODY',
        message: 'Invalid request body',
        retryable: false,
      },
      400
    );
  }

  const messages = toModelMessages(parsed.data.messages);
  if (messages.length === 0) {
    return apiErrorResponse(
      {
        code: 'EMPTY_MESSAGES',
        message: 'messages must include at least one text message',
        retryable: false,
      },
      400
    );
  }

  const chatId =
    parsed.data.id?.trim() ||
    `legacy-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const owner = normalizeOwnerFromRequest(parsed.data.owner, parsed.data.userContext) ?? {
    ownerType: 'guest' as const,
    ownerId: `legacy:${chatId}`,
  };
  const ownerValidation = ChatOwnerSchema.safeParse(owner);
  if (!ownerValidation.success) {
    return apiErrorResponse(
      {
        code: 'INVALID_OWNER_CONTEXT',
        message: 'Invalid owner info for chat run',
        retryable: false,
      },
      400
    );
  }
  const authError = await assertOwnerAuthorized(req, ownerValidation.data);
  if (authError) return authError;

  try {
    ensureChatRunWorkerStarted();
    const trigger = parsed.data.trigger ?? 'submit-message';
    const regenerateMessageId =
      trigger === 'regenerate-message'
        ? parsed.data.messageId ?? null
        : null;

    const existingNonTerminal = await getAnyNonTerminalChatRunByChatOwner(chatId, ownerValidation.data);
    if (existingNonTerminal?.cancelRequestedAt) {
      return apiErrorResponse(
        {
          code: 'RUN_CANCELLING',
          message: 'A previous run is still being cancelled. Please wait a moment and retry.',
          retryable: true,
        },
        409
      );
    }
    const run =
      existingNonTerminal ??
      (await createChatRun({
        chatId,
        owner: ownerValidation.data,
        trigger,
        regenerateMessageId,
        requestMessages: parsed.data.messages,
        userContext: parsed.data.userContext,
      }));

    return createUIMessageStreamResponse({
      headers: {
        'Cache-Control': 'no-store',
      },
      stream: createChatRunUIMessageStream(run.id),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to process chat request';
    const lower = message.toLowerCase();

    if (lower.includes('rate limit') || lower.includes('429')) {
      return apiErrorResponse(
        {
          code: 'RATE_LIMITED',
          message: 'Model provider rate limit reached. Please retry shortly.',
          retryable: true,
          details: message,
        },
        429
      );
    }

    if (
      lower.includes('anthropic') ||
      lower.includes('openai') ||
      lower.includes('model') ||
      lower.includes('timeout') ||
      lower.includes('fetch failed')
    ) {
      return apiErrorResponse(
        {
          code: 'UPSTREAM_MODEL_ERROR',
          message: 'Model provider request failed. Please retry.',
          retryable: true,
          details: message,
        },
        502
      );
    }

    return apiErrorResponse(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to process chat request',
        retryable: true,
        details: message,
      },
      500
    );
  }
}
