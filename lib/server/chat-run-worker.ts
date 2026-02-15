import type { UIMessageChunk } from 'ai';
import { createChatStreamResult, toModelMessages, toStoredMessages } from '@/lib/server/chat-runtime';
import {
  appendChatRunEvent,
  batchAppendChatRunEvents,
  claimNextChatRun,
  cleanupChatRuns,
  getChatRunById,
  listChatRunEvents,
  markChatRunCancelled,
  markChatRunCompleted,
  markChatRunFailed,
  renewChatRunLease,
  type ChatRunRecord,
} from '@/lib/server/chat-run-store';
import {
  getConversationByOwnerAndId,
  upsertConversation,
  type ConversationOwner,
} from '@/lib/server/conversation-store';
import { clearAnalysisProgress, setAnalysisProgress, scheduleClearAnalysisProgress } from '@/lib/server/analysis-progress';
import { resolveRuntimeChatModel } from '@/lib/server/chat-model-store';
import { RunLogger } from '@/lib/server/run-logger';
import type {
  ContextInjectionStatus,
  Conversation,
  StoredMessage,
} from '@/lib/stores/chat-store';

const WORKER_IDLE_SLEEP_MS = 500;
const WORKER_ERROR_SLEEP_MS = 1500;
const WORKER_LEASE_MS = 60_000;
const WORKER_LEASE_RENEW_INTERVAL_MS = 15_000;
const WORKER_CLEANUP_INTERVAL_MS = 60_000;
const MAX_CONCURRENT_RUNS = 3;

type WorkerState = {
  started: boolean;
  shouldRun: boolean;
  loopPromise: Promise<void> | null;
};

declare global {
  var __bnbrainChatRunWorkerState: WorkerState | undefined;
}

function getWorkerState(): WorkerState {
  if (!globalThis.__bnbrainChatRunWorkerState) {
    globalThis.__bnbrainChatRunWorkerState = {
      started: false,
      shouldRun: true,
      loopPromise: null,
    };
  }
  return globalThis.__bnbrainChatRunWorkerState;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRunOwner(run: ChatRunRecord): ConversationOwner {
  return {
    ownerType: run.ownerType,
    ownerId: run.ownerType === 'wallet' ? run.ownerId.toLowerCase() : run.ownerId,
  };
}

function normalizeContextStatus(
  value: unknown
): ContextInjectionStatus {
  if (
    value === 'not_injected' ||
    value === 'pending' ||
    value === 'injected' ||
    value === 'stale'
  ) {
    return value;
  }
  return 'not_injected';
}

function generateTitleFromMessages(messages: StoredMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  const text = firstUser?.content?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return 'New conversation';
  return text.length > 50 ? `${text.slice(0, 50)}…` : text;
}

function extractAssistantMessageFromEvents(
  runId: string,
  events: Array<{ chunk: UIMessageChunk }>
): StoredMessage | null {
  const textByPartId = new Map<string, string>();
  const textOrder: string[] = [];
  // Track tool invocations: toolCallId → partial info
  const toolCalls = new Map<string, {
    toolName: string;
    input: unknown;
    output?: unknown;
    state: string;
  }>();
  const toolOrder: string[] = [];

  for (const event of events) {
    const chunk = event.chunk;
    switch (chunk.type) {
      case 'text-start':
        if (!textByPartId.has(chunk.id)) {
          textByPartId.set(chunk.id, '');
          textOrder.push(chunk.id);
        }
        break;
      case 'text-delta': {
        const current = textByPartId.get(chunk.id) ?? '';
        textByPartId.set(chunk.id, `${current}${chunk.delta}`);
        break;
      }
      case 'tool-input-available':
        if (!toolCalls.has(chunk.toolCallId)) {
          toolOrder.push(chunk.toolCallId);
        }
        toolCalls.set(chunk.toolCallId, {
          toolName: chunk.toolName,
          input: chunk.input,
          state: 'partial-call',
        });
        break;
      case 'tool-output-available': {
        const existing = toolCalls.get(chunk.toolCallId);
        if (existing) {
          existing.output = chunk.output;
          existing.state = 'result';
        }
        break;
      }
      case 'tool-output-error': {
        const existingErr = toolCalls.get(chunk.toolCallId);
        if (existingErr) {
          existingErr.output = { error: chunk.errorText };
          existingErr.state = 'result';
        }
        break;
      }
    }
  }

  const orderedText = textOrder
    .map((id) => textByPartId.get(id) ?? '')
    .join('')
    .trim();

  const parts: Array<{ type: string; [key: string]: unknown }> = [];

  if (orderedText) {
    parts.push({ type: 'text', text: orderedText });
  }

  for (const toolCallId of toolOrder) {
    const tc = toolCalls.get(toolCallId);
    if (!tc) continue;
    parts.push({
      type: 'tool-invocation',
      toolCallId,
      toolName: tc.toolName,
      args: tc.input,
      state: tc.state === 'result' ? 'result' : 'partial-call',
      ...(tc.state === 'result' ? { result: tc.output } : {}),
    });
  }

  if (parts.length === 0) return null;

  return {
    id: `assistant-${runId}`,
    role: 'assistant',
    content: orderedText,
    parts,
    createdAt: Date.now(),
  };
}

async function persistRunConversationState(run: ChatRunRecord): Promise<void> {
  const owner = normalizeRunOwner(run);
  const existing = await getConversationByOwnerAndId(owner, run.chatId);
  const baseMessages = toStoredMessages(run.requestMessages);
  const finalMessages = [...baseMessages];
  if (run.trigger === 'regenerate-message' && run.regenerateMessageId) {
    for (let i = finalMessages.length - 1; i >= 0; i -= 1) {
      if (finalMessages[i].id === run.regenerateMessageId) {
        finalMessages.splice(i, 1);
        break;
      }
    }
  }
  const events = await listChatRunEvents(run.id);
  const assistantMessage = extractAssistantMessageFromEvents(run.id, events);
  if (assistantMessage) {
    finalMessages.push(assistantMessage);
  }

  const now = Date.now();
  const conversation: Conversation = {
    id: run.chatId,
    title: existing?.title ?? generateTitleFromMessages(finalMessages),
    messages: finalMessages,
    walletAddress:
      owner.ownerType === 'wallet'
        ? owner.ownerId
        : existing?.walletAddress ?? undefined,
    isStarred: existing?.isStarred ?? false,
    isShared: existing?.isShared ?? false,
    sharedAt: existing?.sharedAt,
    shareToken: existing?.shareToken,
    shareExpiresAt: existing?.shareExpiresAt,
    forkedFromShareToken: existing?.forkedFromShareToken,
    scope: owner.ownerType === 'wallet' ? 'wallet' : 'guest',
    contextInjectionStatus: existing
      ? existing.contextInjectionStatus
      : normalizeContextStatus(run.userContext?.conversationContextStatus),
    contextFingerprint: existing?.contextFingerprint,
    contextInjectedAt: existing?.contextInjectedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await upsertConversation(owner, conversation);
}

function extractFirstUserText(rawMessages: unknown[]): string {
  for (const msg of rawMessages) {
    const m = msg as { role?: string; content?: string; parts?: unknown[] };
    if (m?.role !== 'user') continue;
    if (typeof m.content === 'string' && m.content.trim()) return m.content.trim();
    if (Array.isArray(m.parts)) {
      for (const p of m.parts) {
        const part = p as { type?: string; text?: string };
        if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) return part.text.trim();
      }
    }
  }
  return '';
}

async function processChatRun(run: ChatRunRecord): Promise<void> {
  const lockToken = run.lockToken;
  if (!lockToken) {
    throw new Error(`Missing lock token for run ${run.id}`);
  }

  // ── Hook 1: Create RunLogger ──
  const logger = new RunLogger({ runId: run.id, chatId: run.chatId });

  if (run.lastEventSeq > 0) {
    // Run was previously started and produced events before being interrupted.
    // Mark as failed so the client can auto-retry or prompt user.
    const errorText = 'Run was interrupted on server and cannot be resumed. The response will be regenerated.';
    logger.runStart({
      owner: normalizeRunOwner(run),
      trigger: run.trigger,
      userContext: run.userContext,
      messageCount: run.requestMessages.length,
      firstUserMessage: extractFirstUserText(run.requestMessages),
    });
    logger.runEnd({ status: 'failed', errorText });
    await appendChatRunEvent(run.id, {
      type: 'error',
      errorText,
    }).catch(() => undefined);
    await markChatRunFailed(run.id, errorText);
    // Persist partial conversation state so history stays consistent
    try {
      await persistRunConversationState(run);
    } catch (persistError) {
      console.error('[chat run worker] Failed to persist interrupted run conversation state', persistError);
      logger.persistError({ phase: 'interrupted', errorMessage: persistError instanceof Error ? persistError.message : String(persistError), errorStack: persistError instanceof Error ? persistError.stack : undefined });
    }
    clearAnalysisProgress(run.chatId);
    return;
  }

  const modelMessages = toModelMessages(run.requestMessages);
  if (modelMessages.length === 0) {
    const errorText = 'messages must include at least one text message';
    await appendChatRunEvent(run.id, {
      type: 'error',
      errorText,
    });
    await markChatRunFailed(run.id, errorText);
    return;
  }

  let stopped = false;
  const abortController = new AbortController();
  let leaseRenewFailCount = 0;
  const renewTimer = setInterval(() => {
    void renewChatRunLease(run.id, lockToken, WORKER_LEASE_MS)
      .then((renewed) => {
        if (renewed) {
          leaseRenewFailCount = 0;
        } else {
          leaseRenewFailCount += 1;
          console.warn(`[chat run worker] Lease renewal returned false for run ${run.id} (fail #${leaseRenewFailCount})`);
        }
      })
      .catch((error) => {
        leaseRenewFailCount += 1;
        console.warn(`[chat run worker] Lease renewal failed for run ${run.id} (fail #${leaseRenewFailCount})`, error);
      });
  }, WORKER_LEASE_RENEW_INTERVAL_MS);

  // ── Hook 1b: Log run start ──
  logger.runStart({
    owner: normalizeRunOwner(run),
    trigger: run.trigger,
    userContext: run.userContext,
    messageCount: run.requestMessages.length,
    firstUserMessage: extractFirstUserText(run.requestMessages),
  });

  // ── Hook 2: Log resolved model ──
  resolveRuntimeChatModel(run.userContext?.modelId ?? null)
    .then((resolved) => {
      logger.modelResolved({
        displayName: resolved.displayName,
        providerModelId: resolved.providerModelId,
        baseUrl: resolved.baseUrl,
        protocol: resolved.protocol,
      });
    })
    .catch(() => {});

  try {
    const result = await createChatStreamResult({
      modelMessages,
      userContext: run.userContext,
      abortSignal: abortController.signal,
      chatId: run.chatId,
      logger,
    });

    let hasErrorChunk = false;
    let lastFlushAt = Date.now();
    const FLUSH_INTERVAL_MS = 200;
    const FLUSH_BATCH_SIZE = 20;
    const CANCEL_CHECK_INTERVAL_MS = 2000;
    let lastCancelCheckAt = Date.now();
    const pendingChunks: import('ai').UIMessageChunk[] = [];

    const flushPending = async () => {
      if (pendingChunks.length === 0) return;
      const batch = pendingChunks.splice(0, pendingChunks.length);
      await batchAppendChatRunEvents(run.id, batch);
      lastFlushAt = Date.now();
    };

    // ── Stream iteration with heartbeat ────────────────────
    // During long tool execution (e.g. deepTokenAnalysis ~15-30s),
    // no chunks flow from streamText(). We use Promise.race to inject
    // heartbeat events every 8s so the client stall detector stays happy.
    const HEARTBEAT_INTERVAL_MS = 8000;
    let heartbeatSeq = 0;
    const stream = result.toUIMessageStream();
    const iterator = stream[Symbol.asyncIterator]();
    let pendingNext = iterator.next();

    while (true) {
      const ac = new AbortController();
      const winner = await Promise.race([
        pendingNext.then((r) => {
          ac.abort();
          return { src: 'chunk' as const, done: r.done, value: r.value };
        }),
        new Promise<{ src: 'heartbeat' }>((resolve) => {
          const id = setTimeout(() => resolve({ src: 'heartbeat' }), HEARTBEAT_INTERVAL_MS);
          ac.signal.addEventListener('abort', () => clearTimeout(id));
        }),
      ]);

      if (winner.src === 'heartbeat') {
        // Keep-alive: write a source event so the client stream doesn't stall.
        // Also check for cancellation during long tool execution.
        heartbeatSeq++;
        logger.heartbeat(heartbeatSeq, `heartbeat-${heartbeatSeq}`);
        await appendChatRunEvent(run.id, {
          type: 'source-url',
          sourceId: `heartbeat-${heartbeatSeq}`,
          url: '',
          title: '',
        });

        // Check cancellation (the only chance during long tool execution)
        if (leaseRenewFailCount >= 3) {
          console.error(`[chat run worker] Aborting run ${run.id} due to ${leaseRenewFailCount} consecutive lease renewal failures`);
          abortController.abort();
          stopped = true;
          break;
        }
        const current = await getChatRunById(run.id);
        if (current?.cancelRequestedAt) {
          abortController.abort();
          stopped = true;
          break;
        }
        continue;
      }

      if (winner.done) break;
      const chunk = winner.value!;

      // ── Hook 3: Log every chunk (aggregation happens inside logger) ──
      logger.handleChunk(chunk);

      if (chunk.type === 'error') {
        hasErrorChunk = true;
      }

      // ── Hide tool errors from client ──────────────────────
      if (chunk.type === 'tool-output-error') {
        logger.toolErrorHidden({ toolCallId: chunk.toolCallId, toolName: chunk.toolName, errorText: chunk.errorText });
        console.error(`[chat run worker] Tool error hidden for run ${run.id}: toolCallId=${chunk.toolCallId} error=${chunk.errorText}`);
        pendingChunks.push({
          type: 'tool-output-available',
          toolCallId: chunk.toolCallId,
          output: { _hidden: true },
        } as import('ai').UIMessageChunk);
        const now = Date.now();
        const shouldFlush =
          pendingChunks.length >= FLUSH_BATCH_SIZE ||
          now - lastFlushAt >= FLUSH_INTERVAL_MS;
        if (shouldFlush) await flushPending();
        pendingNext = iterator.next();
        continue;
      }
      if (
        chunk.type === 'tool-output-available' &&
        chunk.output != null &&
        typeof chunk.output === 'object' &&
        'error' in (chunk.output as Record<string, unknown>) &&
        Boolean((chunk.output as Record<string, unknown>).error)
      ) {
        logger.toolErrorHidden({ toolCallId: chunk.toolCallId, toolName: chunk.toolName, errorText: String((chunk.output as Record<string, unknown>).error) });
        console.error(`[chat run worker] Tool output error hidden for run ${run.id}: toolCallId=${chunk.toolCallId} error=${(chunk.output as Record<string, unknown>).error}`);
        pendingChunks.push({
          type: 'tool-output-available',
          toolCallId: chunk.toolCallId,
          output: { _hidden: true },
        } as import('ai').UIMessageChunk);
        const now = Date.now();
        const shouldFlush =
          pendingChunks.length >= FLUSH_BATCH_SIZE ||
          now - lastFlushAt >= FLUSH_INTERVAL_MS;
        if (shouldFlush) await flushPending();
        pendingNext = iterator.next();
        continue;
      }
      // ─────────────────────────────────────────────────────

      pendingChunks.push(chunk);

      const now = Date.now();
      const shouldFlush =
        pendingChunks.length >= FLUSH_BATCH_SIZE ||
        now - lastFlushAt >= FLUSH_INTERVAL_MS;

      if (shouldFlush) {
        await flushPending();
      }

      if (now - lastCancelCheckAt >= CANCEL_CHECK_INTERVAL_MS) {
        lastCancelCheckAt = now;
        if (leaseRenewFailCount >= 3) {
          console.error(`[chat run worker] Aborting run ${run.id} due to ${leaseRenewFailCount} consecutive lease renewal failures`);
          abortController.abort();
          stopped = true;
          break;
        }
        const current = await getChatRunById(run.id);
        if (current?.cancelRequestedAt) {
          abortController.abort();
          stopped = true;
          break;
        }
      }

      pendingNext = iterator.next();
    }

    // Flush any remaining buffered chunks
    await flushPending();

    if (stopped) {
      logger.runEnd({ status: 'cancelled' });
      await markChatRunCancelled(run.id);
      setAnalysisProgress(run.chatId, {
        tokenAddress: '',
        tokenName: null,
        tokenSymbol: null,
        phase: 'cancelled',
        steps: [],
        startedAt: Date.now(),
        finished: true,
        error: 'Analysis was cancelled.',
      });
      scheduleClearAnalysisProgress(run.chatId, 30_000);
      return;
    }

    if (hasErrorChunk) {
      const errMsg = 'Chat stream returned error chunk';
      logger.runEnd({ status: 'failed', errorText: errMsg });
      await markChatRunFailed(run.id, errMsg);
      setAnalysisProgress(run.chatId, {
        tokenAddress: '',
        tokenName: null,
        tokenSymbol: null,
        phase: 'error',
        steps: [],
        startedAt: Date.now(),
        finished: true,
        error: errMsg,
      });
      scheduleClearAnalysisProgress(run.chatId, 30_000);
      return;
    }

    logger.runEnd({ status: 'completed' });
    await markChatRunCompleted(run.id);
    try {
      await persistRunConversationState(run);
    } catch (persistError) {
      console.error('[chat run worker] Failed to persist conversation state (run already completed)', persistError);
      logger.persistError({ phase: 'completed', errorMessage: persistError instanceof Error ? persistError.message : String(persistError), errorStack: persistError instanceof Error ? persistError.stack : undefined });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to process chat run';
    logger.runEnd({ status: 'failed', errorText: message });
    await appendChatRunEvent(run.id, {
      type: 'error',
      errorText: message,
    }).catch(() => undefined);
    await markChatRunFailed(run.id, message);
    setAnalysisProgress(run.chatId, {
      tokenAddress: '',
      tokenName: null,
      tokenSymbol: null,
      phase: 'error',
      steps: [],
      startedAt: Date.now(),
      finished: true,
      error: message,
    });
    scheduleClearAnalysisProgress(run.chatId, 30_000);
  } finally {
    clearInterval(renewTimer);
  }
}

async function runWorkerLoop(): Promise<void> {
  const state = getWorkerState();
  let lastCleanupAt = 0;
  let activeRunCount = 0;
  while (state.shouldRun) {
    try {
      const now = Date.now();
      if (now - lastCleanupAt >= WORKER_CLEANUP_INTERVAL_MS) {
        lastCleanupAt = now;
        const cleanupResult = await cleanupChatRuns();
        const cleanupTotal =
          cleanupResult.failedStaleRunningCount +
          cleanupResult.failedStaleQueuedCount +
          cleanupResult.deletedTerminalCount;
        if (cleanupTotal > 0) {
          console.info('[chat run cleanup]', cleanupResult);
        }
      }
      if (activeRunCount >= MAX_CONCURRENT_RUNS) {
        await sleep(WORKER_IDLE_SLEEP_MS);
        continue;
      }
      const run = await claimNextChatRun({ leaseMs: WORKER_LEASE_MS });
      if (!run) {
        await sleep(WORKER_IDLE_SLEEP_MS);
        continue;
      }
      activeRunCount += 1;
      processChatRun(run)
        .catch((error) => {
          console.error('[chat run worker] Unhandled error in processChatRun', error);
        })
        .finally(() => {
          activeRunCount -= 1;
        });
    } catch (error) {
      console.error('[chat run worker loop]', error);
      await sleep(WORKER_ERROR_SLEEP_MS);
    }
  }
}

export function ensureChatRunWorkerStarted(): void {
  const state = getWorkerState();
  if (state.started) return;
  state.started = true;
  state.loopPromise = runWorkerLoop().catch((error) => {
    console.error('[chat run worker] Fatal error, resetting worker state for restart', error);
    state.started = false;
    state.loopPromise = null;
  });
}

export function stopChatRunWorker(): void {
  const state = getWorkerState();
  state.shouldRun = false;
}
