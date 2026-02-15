import type { Conversation } from '@/lib/stores/chat-store';

export interface OwnerIdentity {
  ownerType: 'wallet' | 'guest';
  ownerId: string;
}

export interface ShareState {
  isShared: boolean;
  shareToken?: string;
  sharedAt?: number;
  shareExpiresAt?: number;
}

export interface TitleGenerationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_FETCH_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;
const RETRY_MAX_DELAY_MS = 2200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number): number {
  const exponential = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1)
  );
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.round(exponential * jitter);
}

function shouldRetryStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, init);
      if (
        response.ok ||
        !shouldRetryStatus(response.status) ||
        attempt >= MAX_FETCH_RETRIES
      ) {
        return response;
      }
    } catch (error) {
      if (attempt >= MAX_FETCH_RETRIES) {
        throw error;
      }
    }
    attempt += 1;
    await sleep(getRetryDelayMs(attempt));
  }
}

async function ensureOkResponse(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  throw new Error(`${action} failed: ${response.status}${body ? ` ${body}` : ''}`);
}

function normalizeOwner(owner: OwnerIdentity): OwnerIdentity {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
  };
}

export async function fetchRemoteConversations(
  ownerInput: OwnerIdentity
): Promise<Conversation[]> {
  const owner = normalizeOwner(ownerInput);
  const params = new URLSearchParams({
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  });
  const res = await fetchWithRetry(`/api/conversations?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch conversations: ${res.status}`);
  }
  const payload = (await res.json()) as { conversations?: Conversation[] };
  return Array.isArray(payload.conversations) ? payload.conversations : [];
}

export async function syncConversationToRemote(
  ownerInput: OwnerIdentity,
  conversation: Conversation
): Promise<void> {
  const owner = normalizeOwner(ownerInput);
  const res = await fetchWithRetry('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner,
      conversation,
    }),
  });
  await ensureOkResponse(res, 'Sync conversation');
}

export async function deleteConversationFromRemote(
  ownerInput: OwnerIdentity,
  conversationId: string
): Promise<void> {
  const owner = normalizeOwner(ownerInput);
  const res = await fetchWithRetry('/api/conversations', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner,
      conversationId,
    }),
  });
  await ensureOkResponse(res, 'Delete conversation');
}

export async function ensureConversationShare(
  ownerInput: OwnerIdentity,
  conversationId: string,
  expiresAt?: number | null
): Promise<ShareState> {
  const owner = normalizeOwner(ownerInput);
  const res = await fetchWithRetry('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner,
      conversationId,
      expiresAt,
    }),
  });
  await ensureOkResponse(res, 'Enable conversation sharing');
  const payload = (await res.json()) as {
    shareToken?: string;
    sharedAt?: number;
    shareExpiresAt?: number;
    isShared?: boolean;
  };
  return {
    isShared: payload.isShared !== false,
    shareToken:
      typeof payload.shareToken === 'string' && payload.shareToken
        ? payload.shareToken
        : undefined,
    sharedAt:
      typeof payload.sharedAt === 'number' && Number.isFinite(payload.sharedAt)
        ? payload.sharedAt
        : undefined,
    shareExpiresAt:
      typeof payload.shareExpiresAt === 'number' &&
      Number.isFinite(payload.shareExpiresAt)
        ? payload.shareExpiresAt
        : undefined,
  };
}

export async function clearConversationShare(
  ownerInput: OwnerIdentity,
  conversationId: string
): Promise<void> {
  const owner = normalizeOwner(ownerInput);
  const res = await fetchWithRetry('/api/share', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner,
      conversationId,
    }),
  });
  await ensureOkResponse(res, 'Disable conversation sharing');
}

export async function fetchSharedConversation(shareToken: string): Promise<Conversation> {
  const token = shareToken.trim();
  if (!token) {
    throw new Error('Invalid share token');
  }
  const res = await fetchWithRetry(`/api/share/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch shared conversation: ${res.status}`);
  }
  const payload = (await res.json()) as { conversation?: Conversation };
  if (!payload.conversation) {
    throw new Error('Shared conversation payload is invalid');
  }
  return payload.conversation;
}

export async function forkSharedConversation(
  shareToken: string,
  ownerInput: OwnerIdentity
): Promise<{ conversationId: string; conversation: Conversation }> {
  const token = shareToken.trim();
  if (!token) {
    throw new Error('Invalid share token');
  }
  const owner = normalizeOwner(ownerInput);
  const res = await fetchWithRetry(
    `/api/share/${encodeURIComponent(token)}/fork`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner }),
    }
  );
  await ensureOkResponse(res, 'Fork shared conversation');
  const payload = (await res.json()) as {
    conversationId?: string;
    conversation?: Conversation;
  };
  if (!payload.conversationId || !payload.conversation) {
    throw new Error('Fork response payload is invalid');
  }
  return {
    conversationId: payload.conversationId,
    conversation: payload.conversation,
  };
}

export async function generateConversationTitle(
  messages: TitleGenerationMessage[],
  modelId?: string | null
): Promise<string> {
  const compactMessages = messages
    .map((message) => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content.trim() : '',
    }))
    .filter((message) => message.content.length > 0);
  if (compactMessages.length === 0) {
    throw new Error('Cannot generate title from empty messages');
  }

  const res = await fetchWithRetry('/api/chat/title', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: compactMessages,
      modelId: modelId?.trim() || undefined,
    }),
  });
  await ensureOkResponse(res, 'Generate conversation title');
  const payload = (await res.json()) as { title?: string };
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (!title) {
    throw new Error('Title generation returned empty title');
  }
  return title;
}
