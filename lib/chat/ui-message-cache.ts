import type { UIMessage } from 'ai';
import type { StoredMessage } from '@/lib/stores/chat-store';

const uiMessagesCache = new WeakMap<StoredMessage[], UIMessage[]>();
let lastCacheInput: StoredMessage[] | null = null;
let lastCacheOutput: UIMessage[] | null = null;

function dedupeStoredMessagesById(stored: StoredMessage[]): StoredMessage[] {
  const latestById = new Map<string, { message: StoredMessage; index: number }>();
  for (let index = 0; index < stored.length; index += 1) {
    latestById.set(stored[index].id, {
      message: stored[index],
      index,
    });
  }
  return Array.from(latestById.values())
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.message);
}

function toUIMessages(stored: StoredMessage[]): UIMessage[] {
  const deduped = dedupeStoredMessagesById(stored);
  return deduped.map((message) => {
    const uiMsg: UIMessage = {
      id: message.id,
      role: message.role,
      parts: message.parts
        ? (message.parts as UIMessage['parts'])
        : [{ type: 'text' as const, text: message.content }],
    };
    // Carry through hidden flag so isSilentContextMessage can filter it
    if (message.hidden) (uiMsg as UIMessage & { hidden?: boolean }).hidden = true;
    return uiMsg;
  });
}

export function toCachedUIMessages(stored: StoredMessage[]): UIMessage[] {
  if (stored === lastCacheInput && lastCacheOutput) return lastCacheOutput;
  const cached = uiMessagesCache.get(stored);
  if (cached) {
    lastCacheInput = stored;
    lastCacheOutput = cached;
    return cached;
  }
  const converted = toUIMessages(stored);
  uiMessagesCache.set(stored, converted);
  lastCacheInput = stored;
  lastCacheOutput = converted;
  return converted;
}

export function warmCachedUIMessages(stored?: StoredMessage[]): void {
  if (!stored || stored.length === 0) return;
  void toCachedUIMessages(stored);
}
