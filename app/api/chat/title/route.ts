import { generateText, type ModelMessage } from 'ai';
import { z } from 'zod';
import { apiErrorResponse } from '@/lib/errors/api-error';
import { getChatModel, toModelMessages } from '@/lib/server/chat-runtime';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

const TitleRequestSchema = z.object({
  messages: z.array(z.any()).default([]),
  modelId: z.string().min(1).max(160).optional(),
});

const TITLE_SOURCE_LIMIT = 8;

const TITLE_SYSTEM_PROMPT = [
  'You generate concise chat conversation titles.',
  'Return only the title text.',
  'Do not use quotes, markdown, list prefixes, or trailing punctuation.',
  'Keep it concrete and recognizable.',
  'Prefer 4-10 words.',
  'Use the same language as the latest user message.',
].join('\n');

function toCompactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeGeneratedTitle(raw: string): string {
  const compact = toCompactText(
    raw
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/^title\s*:\s*/i, ' ')
      .replace(/^["'`]+|["'`]+$/g, ' ')
  );
  if (!compact) return 'New conversation';
  const clipped = compact.length > 56 ? `${compact.slice(0, 56).trim()}…` : compact;
  return clipped || 'New conversation';
}

function buildFallbackTitle(messages: ModelMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  const text =
    typeof firstUser?.content === 'string'
      ? toCompactText(firstUser.content)
      : '';
  if (!text) return 'New conversation';
  return text.length > 56 ? `${text.slice(0, 56).trim()}…` : text;
}

function buildTranscript(messages: ModelMessage[]): string {
  return messages
    .map((message) => `[${message.role}] ${toCompactText(String(message.content ?? ''))}`)
    .filter((line) => line.length > 0)
    .join('\n');
}

export async function POST(req: Request) {
  const ownerType = req.headers.get('x-bnb-owner-type');
  const ownerId = req.headers.get('x-bnb-owner-id');
  if (!ownerType || !ownerId) {
    return apiErrorResponse(
      { code: 'UNAUTHORIZED', message: 'Missing owner identity headers', retryable: false },
      401
    );
  }

  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `title:ip:${ip}`, limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return apiErrorResponse(
      { code: 'RATE_LIMITED', message: 'Too many title requests. Please retry shortly.', retryable: true },
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

  const parsed = TitleRequestSchema.safeParse(body);
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

  const modelMessages = toModelMessages(parsed.data.messages).slice(-TITLE_SOURCE_LIMIT);
  if (modelMessages.length === 0) {
    return apiErrorResponse(
      {
        code: 'EMPTY_MESSAGES',
        message: 'messages must include at least one text message',
        retryable: false,
      },
      400
    );
  }

  try {
    const transcript = buildTranscript(modelMessages);
    const languageModel = await getChatModel(parsed.data.modelId ?? null);
    const result = await generateText({
      model: languageModel,
      system: TITLE_SYSTEM_PROMPT,
      prompt: [
        'Conversation transcript:',
        transcript,
        '',
        'Generate the best concise title now.',
      ].join('\n'),
    });

    const generated = sanitizeGeneratedTitle(result.text);
    const title =
      generated === 'New conversation'
        ? buildFallbackTitle(modelMessages)
        : generated;

    return Response.json({ title });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate title';
    const lower = message.toLowerCase();
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
        message: 'Failed to generate title',
        retryable: true,
        details: message,
      },
      500
    );
  }
}
