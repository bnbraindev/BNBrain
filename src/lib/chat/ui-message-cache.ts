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

type LoosePart = { type?: unknown; [key: string]: unknown };

function normalizeLegacyToolPart(
  part: LoosePart
): UIMessage['parts'][number] {
  const rawType = typeof part.type === 'string' ? part.type : '';
  const legacyState = typeof part.state === 'string' ? part.state : '';

  // Legacy worker format:
  // { type: 'tool-invocation', toolName, toolCallId, args, result, state: 'partial-call' | 'result' }
  if (rawType === 'tool-invocation') {
    const toolName =
      typeof part.toolName === 'string' && part.toolName.trim().length > 0
        ? part.toolName.trim()
        : 'unknownTool';
    const toolType = `tool-${toolName}`;
    const toolCallId =
      typeof part.toolCallId === 'string' && part.toolCallId.trim().length > 0
        ? part.toolCallId
        : `legacy-${toolName}`;
    const input = (part.input ?? part.args) as unknown;
    const output = (part.output ?? part.result) as unknown;

    if (legacyState === 'result' || output !== undefined) {
      const outputError =
        output &&
        typeof output === 'object' &&
        'error' in (output as Record<string, unknown>)
          ? (output as Record<string, unknown>).error
          : undefined;

      if (
        typeof part.errorText === 'string' && part.errorText.trim().length > 0
      ) {
        return {
          type: toolType,
          toolCallId,
          state: 'output-error',
          input,
          errorText: part.errorText,
        } as UIMessage['parts'][number];
      }

      if (outputError !== undefined && outputError !== null && outputError !== '') {
        return {
          type: toolType,
          toolCallId,
          state: 'output-error',
          input,
          errorText: String(outputError),
        } as UIMessage['parts'][number];
      }

      return {
        type: toolType,
        toolCallId,
        state: 'output-available',
        input,
        output,
      } as UIMessage['parts'][number];
    }

    return {
      type: toolType,
      toolCallId,
      state: 'input-available',
      input,
    } as UIMessage['parts'][number];
  }

  // Some historical parts already used `tool-xxx` but with old `state: 'result'`.
  if (rawType.startsWith('tool-') && legacyState === 'result') {
    const output = (part.output ?? part.result) as unknown;
    const input = (part.input ?? part.args) as unknown;
    return {
      ...(part as Record<string, unknown>),
      state: 'output-available',
      input,
      output,
    } as UIMessage['parts'][number];
  }

  return part as UIMessage['parts'][number];
}

function toolPartPriority(part: UIMessage['parts'][number]): number {
  if (typeof part.type !== 'string') return -1;
  if (!part.type.startsWith('tool-') && part.type !== 'dynamic-tool') return -1;
  const state =
    typeof (part as { state?: unknown }).state === 'string'
      ? ((part as { state: string }).state as string)
      : '';
  if (state === 'output-available') return 4;
  if (state === 'output-error') return 3;
  if (state === 'input-available') return 2;
  if (state === 'input-streaming') return 1;
  return 0;
}

function normalizeMessageParts(parts: StoredMessage['parts']): UIMessage['parts'] {
  if (!parts || parts.length === 0) {
    return [];
  }

  const normalized = (parts as LoosePart[]).map(normalizeLegacyToolPart);

  // Keep only the strongest state per toolCallId to avoid showing stale loading
  // alongside a completed/error state for the same invocation.
  const output: UIMessage['parts'] = [];
  const toolIndexByCallId = new Map<string, number>();
  const toolPriorityByCallId = new Map<string, number>();

  for (const part of normalized) {
    const isToolLike =
      typeof part.type === 'string' &&
      (part.type.startsWith('tool-') || part.type === 'dynamic-tool');
    const callId =
      isToolLike && typeof (part as { toolCallId?: unknown }).toolCallId === 'string'
        ? ((part as { toolCallId: string }).toolCallId as string)
        : null;
    if (!callId) {
      output.push(part);
      continue;
    }

    const nextPriority = toolPartPriority(part);
    const existingIndex = toolIndexByCallId.get(callId);
    if (existingIndex === undefined) {
      toolIndexByCallId.set(callId, output.length);
      toolPriorityByCallId.set(callId, nextPriority);
      output.push(part);
      continue;
    }

    const prevPriority = toolPriorityByCallId.get(callId) ?? -1;
    if (nextPriority >= prevPriority) {
      output[existingIndex] = part;
      toolPriorityByCallId.set(callId, nextPriority);
    }
  }

  return output;
}

function toUIMessages(stored: StoredMessage[]): UIMessage[] {
  const deduped = dedupeStoredMessagesById(stored);
  return deduped.map((message) => {
    const normalizedParts = message.parts ? normalizeMessageParts(message.parts) : [];
    const uiMsg: UIMessage = {
      id: message.id,
      role: message.role,
      parts:
        normalizedParts.length > 0
          ? normalizedParts
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
