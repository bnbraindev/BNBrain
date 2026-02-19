import { sanitizeErrorMessage } from '@/lib/utils/wallet-error';

interface ParsedApiError {
  code?: string;
  message: string;
  retryable: boolean;
  details?: string;
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseChatApiError(error: unknown): ParsedApiError {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';

  const parsed = safeParseJson(raw);
  if (
    parsed &&
    typeof parsed === 'object' &&
    'error' in parsed &&
    parsed.error &&
    typeof parsed.error === 'object'
  ) {
    const payload = parsed.error as Record<string, unknown>;
    return {
      code: typeof payload.code === 'string' ? payload.code : undefined,
      message:
        typeof payload.message === 'string'
          ? sanitizeErrorMessage(payload.message)
          : 'Request failed',
      retryable: Boolean(payload.retryable),
      details:
        typeof payload.details === 'string'
          ? sanitizeErrorMessage(payload.details)
          : undefined,
    };
  }

  return {
    message: sanitizeErrorMessage(raw),
    retryable: false,
  };
}

const ERROR_CODE_MAP: Record<
  string,
  { en: string; zh: string }
> = {
  INVALID_JSON: {
    en: 'Request format is invalid.',
    zh: '请求格式不正确。',
  },
  INVALID_REQUEST_BODY: {
    en: 'Request body is invalid.',
    zh: '请求参数不正确。',
  },
  INVALID_OWNER_CONTEXT: {
    en: 'Chat owner context is missing.',
    zh: '会话归属信息缺失。',
  },
  EMPTY_MESSAGES: {
    en: 'Please enter a message first.',
    zh: '请先输入消息。',
  },
  UNAUTHORIZED: {
    en: 'Sign-in required to continue.',
    zh: '请先登录再继续。',
  },
  FORBIDDEN: {
    en: 'You do not have access to this conversation.',
    zh: '你无权访问该会话。',
  },
  MISSING_API_KEY: {
    en: 'Server AI key is missing.',
    zh: '服务端 AI 密钥缺失。',
  },
  RATE_LIMITED: {
    en: 'Too many requests. Please retry shortly.',
    zh: '请求过多，请稍后重试。',
  },
  UPSTREAM_MODEL_ERROR: {
    en: 'AI provider is temporarily unavailable. Please retry.',
    zh: 'AI 服务暂时不可用，请重试。',
  },
  INTERNAL_SERVER_ERROR: {
    en: 'Server is busy. Please retry.',
    zh: '服务繁忙，请重试。',
  },
};

export function mapChatErrorToUserMessage(
  error: unknown,
  locale: 'en' | 'zh' = 'en'
): { message: string; retryable: boolean; details?: string } {
  const parsed = parseChatApiError(error);
  const mapped = parsed.code ? ERROR_CODE_MAP[parsed.code] : undefined;
  return {
    message: mapped ? mapped[locale] : parsed.message,
    retryable: parsed.retryable,
    details: parsed.details,
  };
}

