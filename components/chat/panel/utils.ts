import type { UIMessage } from 'ai';
import type { StoredMessage } from '@/lib/stores/chat-store';

import {
  SYNC_QUEUE_RETRY_BASE_MS,
  SYNC_QUEUE_RETRY_MAX_MS,
} from './constants';

export function parseEvmChainId(raw: unknown): number | undefined {
  if (typeof raw === 'string') {
    const value = raw.startsWith('0x') ? Number.parseInt(raw, 16) : Number(raw);
    if (Number.isFinite(value) && value > 0) return value;
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return undefined;
}

export function chainNameById(chainId: number): string {
  if (chainId === 97) return 'BSC Testnet';
  if (chainId === 204) return 'opBNB';
  if (chainId === 56) return 'BSC';
  return `Chain ${chainId}`;
}

export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function getSyncQueueRetryDelayMs(attempt: number): number {
  const exponential = Math.min(
    SYNC_QUEUE_RETRY_MAX_MS,
    SYNC_QUEUE_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1)
  );
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.round(exponential * jitter);
}

function getTextContentFromMessageParts(parts: UIMessage['parts'] | undefined): string {
  if (!parts || parts.length === 0) return '';
  let result = '';
  for (const part of parts) {
    if (part.type === 'text') {
      result += part.text;
    }
  }
  return result;
}

export function dedupeUIMessagesById(messages: UIMessage[]): UIMessage[] {
  const latestById = new Map<string, { message: UIMessage; index: number }>();
  for (let index = 0; index < messages.length; index += 1) {
    latestById.set(messages[index].id, {
      message: messages[index],
      index,
    });
  }
  return Array.from(latestById.values())
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.message);
}

export function toStoredMessages(
  messages: UIMessage[],
  previousById?: Map<string, StoredMessage>
): StoredMessage[] {
  const dedupedMessages = dedupeUIMessagesById(messages);
  return dedupedMessages.map((m) => {
    const textParts = getTextContentFromMessageParts(m.parts);
    const previous = previousById?.get(m.id);
    if (
      previous &&
      previous.role === m.role &&
      previous.content === textParts &&
      previous.parts === (m.parts as StoredMessage['parts'])
    ) {
      return previous;
    }
    return {
      id: m.id,
      role: m.role as StoredMessage['role'],
      content: textParts,
      parts: m.parts as StoredMessage['parts'],
      createdAt: previous?.createdAt ?? Date.now(),
    };
  });
}

export function getAssistantOutputMeta(messages: UIMessage[]): {
  hasOutput: boolean;
  signal: string | null;
} {
  let assistantMessage: UIMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') {
      assistantMessage = messages[i];
      break;
    }
  }
  if (!assistantMessage) {
    return { hasOutput: false, signal: null };
  }
  let textLength = 0;
  let toolParts = 0;
  for (const rawPart of assistantMessage.parts as Array<{
    type?: string;
    text?: string;
  }>) {
    if (rawPart.type === 'text') {
      textLength += typeof rawPart.text === 'string' ? rawPart.text.length : 0;
      continue;
    }
    if (typeof rawPart.type === 'string' && rawPart.type.startsWith('tool')) {
      toolParts += 1;
    }
  }
  const hasOutput = textLength > 0 || toolParts > 0;
  return {
    hasOutput,
    signal: `${assistantMessage.id}:${assistantMessage.parts.length}:${textLength}:${toolParts}`,
  };
}

export function hasUnansweredUserTurn(messages: UIMessage[]): boolean {
  if (messages.length === 0) return false;
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex < 0) return false;
  for (let i = lastUserIndex + 1; i < messages.length; i += 1) {
    if (messages[i].role !== 'assistant') continue;
    if (getAssistantOutputMeta([messages[i]]).hasOutput) return false;
  }
  return true;
}

export function formatElapsed(ms: number, locale: 'en' | 'zh'): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  if (totalSeconds < 60) {
    return locale === 'zh' ? `${totalSeconds} 秒前` : `${totalSeconds}s ago`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return locale === 'zh' ? `${totalMinutes} 分钟前` : `${totalMinutes}m ago`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  return locale === 'zh' ? `${totalHours} 小时前` : `${totalHours}h ago`;
}
