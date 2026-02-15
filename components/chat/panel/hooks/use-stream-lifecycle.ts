import { useCallback, useEffect, useRef, useState } from 'react';

import { clearPendingRun, upsertPendingRun, type PersistedPendingRun } from '@/lib/chat/pending-run-store';
import { shouldResumePendingRun } from '@/lib/chat/resume-guard';

import {
  CONNECTING_HARD_TIMEOUT_MS,
  CONNECTING_SOFT_TIMEOUT_MS,
  RUN_START_DEDUP_WINDOW_MS,
  STREAM_STALL_HARD_TIMEOUT_MS,
  STREAM_STALL_SOFT_TIMEOUT_MS,
} from '../constants';
import type { StreamLifecycleState } from '../types';

interface LocalChatError {
  message: string;
  retryable: boolean;
  details?: string;
}

interface AssistantOutputMeta {
  hasOutput: boolean;
  signal: string | null;
}

interface UseStreamLifecycleParams {
  activeConversationId: string | null;
  chatSessionId: string | undefined;
  status: 'error' | 'ready' | 'streaming' | 'submitted';
  activeAssistantOutput: AssistantOutputMeta;
  restoredPendingRun: PersistedPendingRun | null;
  apiHasError: boolean;
  locale: 'en' | 'zh';
  t: (key: string) => string;
  stop: () => void;
  resumeStream: () => Promise<void>;
  cancelRunOnServer: (conversationId: string | null | undefined) => void | Promise<void>;
}

export function useStreamLifecycle({
  activeConversationId,
  chatSessionId,
  status,
  activeAssistantOutput,
  restoredPendingRun,
  apiHasError,
  locale,
  t,
  stop,
  resumeStream,
  cancelRunOnServer,
}: UseStreamLifecycleParams) {
  const [streamLifecycle, setStreamLifecycle] = useState<StreamLifecycleState>({
    phase: 'idle',
    conversationId: null,
    startedAt: null,
    firstChunkAt: null,
    lastChunkAt: null,
  });
  const streamLifecycleRef = useRef(streamLifecycle);
  const [localChatError, setLocalChatError] = useState<LocalChatError | null>(null);

  const assistantStreamSignalRef = useRef<string | null>(null);
  const resumedConversationIdsRef = useRef<Set<string>>(new Set());
  const recoveryInProgressRef = useRef(false);
  const resumeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRunStartAtRef = useRef(0);
  const previousStatusRef = useRef(status);
  const previousIsStreamingRef = useRef(status === 'streaming' || status === 'submitted');

  const isStreaming = status === 'streaming' || status === 'submitted';
  const hasChatError = apiHasError || Boolean(localChatError);

  useEffect(() => {
    streamLifecycleRef.current = streamLifecycle;
  }, [streamLifecycle]);

  const startStreamRun = useCallback((conversationId: string | null) => {
    assistantStreamSignalRef.current = null;
    setLocalChatError(null);
    const now = Date.now();
    lastRunStartAtRef.current = now;
    if (conversationId) {
      resumedConversationIdsRef.current.add(conversationId);
      clearPendingRun(conversationId);
    }
    setStreamLifecycle({
      phase: 'connecting',
      conversationId,
      startedAt: now,
      firstChunkAt: null,
      lastChunkAt: null,
    });
  }, []);

  const markStreamCancelled = useCallback(() => {
    setStreamLifecycle((prev) => {
      if (
        prev.phase === 'connecting' ||
        prev.phase === 'streaming' ||
        prev.phase === 'stalled'
      ) {
        return { ...prev, phase: 'cancelled' };
      }
      return prev;
    });
  }, []);

  const handleStop = useCallback(() => {
    const runningConversationId =
      streamLifecycleRef.current.conversationId ??
      activeConversationId ??
      chatSessionId ??
      null;
    void cancelRunOnServer(runningConversationId);
    stop();
    markStreamCancelled();
  }, [activeConversationId, chatSessionId, cancelRunOnServer, stop, markStreamCancelled]);

  const canStartRun = useCallback((): boolean => {
    return Date.now() - lastRunStartAtRef.current >= RUN_START_DEDUP_WINDOW_MS;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (resumeRetryTimerRef.current) {
      clearTimeout(resumeRetryTimerRef.current);
      resumeRetryTimerRef.current = null;
    }
    if (isStreaming) return;
    if (!canStartRun()) return;
    if (
      !shouldResumePendingRun(
        activeConversationId,
        restoredPendingRun,
        resumedConversationIdsRef.current
      )
    ) {
      return;
    }
    lastRunStartAtRef.current = Date.now();
    recoveryInProgressRef.current = true;
    void resumeStream()
      .then(() => {
        if (!cancelled) {
          recoveryInProgressRef.current = false;
        }
      })
      .catch(() => {
        // Retry once after 3s if first resume attempt fails
        if (cancelled) {
          recoveryInProgressRef.current = false;
          return;
        }
        resumeRetryTimerRef.current = setTimeout(() => {
          resumeRetryTimerRef.current = null;
          if (cancelled) {
            recoveryInProgressRef.current = false;
            return;
          }
          if (!canStartRun()) {
            recoveryInProgressRef.current = false;
            return;
          }
          lastRunStartAtRef.current = Date.now();
          void resumeStream()
            .then(() => {
              if (!cancelled) {
                recoveryInProgressRef.current = false;
              }
            })
            .catch(() => {
              if (!cancelled) {
                recoveryInProgressRef.current = false;
              }
            });
        }, 3000);
      });
    return () => {
      cancelled = true;
      if (resumeRetryTimerRef.current) {
        clearTimeout(resumeRetryTimerRef.current);
        resumeRetryTimerRef.current = null;
      }
      recoveryInProgressRef.current = false;
    };
  }, [activeConversationId, restoredPendingRun, resumeStream, isStreaming, canStartRun]);

  useEffect(() => {
    const conversationId =
      streamLifecycle.conversationId ?? activeConversationId ?? chatSessionId ?? null;
    if (!conversationId) return;
    if (
      streamLifecycle.phase === 'connecting' ||
      streamLifecycle.phase === 'streaming' ||
      streamLifecycle.phase === 'stalled'
    ) {
      upsertPendingRun({
        conversationId,
        phase: streamLifecycle.phase,
        startedAt: streamLifecycle.startedAt ?? Date.now(),
        firstChunkAt: streamLifecycle.firstChunkAt,
        lastChunkAt: streamLifecycle.lastChunkAt,
      });
      return;
    }
    // Don't clear during active recovery — the stream hasn't started yet
    if (!recoveryInProgressRef.current) {
      clearPendingRun(conversationId);
      resumedConversationIdsRef.current.delete(conversationId);
    }
  }, [
    streamLifecycle.phase,
    streamLifecycle.conversationId,
    streamLifecycle.startedAt,
    streamLifecycle.firstChunkAt,
    streamLifecycle.lastChunkAt,
    activeConversationId,
    chatSessionId,
  ]);

  useEffect(() => {
    if (!isStreaming) return;
    if (!activeAssistantOutput.hasOutput || !activeAssistantOutput.signal) return;
    if (assistantStreamSignalRef.current === activeAssistantOutput.signal) return;
    assistantStreamSignalRef.current = activeAssistantOutput.signal;
    const now = Date.now();
    const timer = setTimeout(() => {
      setStreamLifecycle((prev) => {
        if (
          prev.phase === 'idle' ||
          prev.phase === 'done' ||
          prev.phase === 'failed' ||
          prev.phase === 'cancelled'
        ) {
          return prev;
        }
        return {
          ...prev,
          phase: 'streaming',
          firstChunkAt: prev.firstChunkAt ?? now,
          lastChunkAt: now,
        };
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [activeAssistantOutput, isStreaming]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    const previousIsStreaming = previousIsStreamingRef.current;
    const shouldEnterSubmitted = status === 'submitted' && previousStatus !== 'submitted';
    const shouldFinalize = previousIsStreaming && !isStreaming;

    previousStatusRef.current = status;
    previousIsStreamingRef.current = isStreaming;

    if (!shouldEnterSubmitted && !shouldFinalize) return;

    const timer = setTimeout(() => {
      if (shouldEnterSubmitted) {
        setStreamLifecycle((prev) => {
          if (
            prev.phase === 'idle' ||
            prev.phase === 'done' ||
            prev.phase === 'failed' ||
            prev.phase === 'cancelled'
          ) {
            const now = Date.now();
            return {
              phase: 'connecting',
              conversationId: activeConversationId ?? prev.conversationId ?? null,
              startedAt: now,
              firstChunkAt: null,
              lastChunkAt: null,
            };
          }
          return prev;
        });
      }

      if (shouldFinalize) {
        setStreamLifecycle((prev) => {
          if (
            prev.phase === 'connecting' ||
            prev.phase === 'streaming' ||
            prev.phase === 'stalled'
          ) {
            return { ...prev, phase: hasChatError ? 'failed' : 'done' };
          }
          return prev;
        });
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [status, isStreaming, activeConversationId, hasChatError]);

  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const current = streamLifecycleRef.current;
      if (current.phase === 'connecting') {
        const elapsed = now - (current.startedAt ?? now);
        if (elapsed >= CONNECTING_HARD_TIMEOUT_MS) {
          void cancelRunOnServer(
            current.conversationId ?? activeConversationId ?? chatSessionId ?? null
          );
          stop();
          setLocalChatError({
            message: t('chat.connectionTimedOut'),
            retryable: true,
            details:
              locale === 'zh'
                ? '在超时前未收到服务端首字节响应。'
                : 'No response bytes were received before timeout.',
          });
          setStreamLifecycle((prev) => ({ ...prev, phase: 'failed' }));
          return;
        }
        if (elapsed >= CONNECTING_SOFT_TIMEOUT_MS) {
          setStreamLifecycle((prev) =>
            prev.phase === 'connecting' ? { ...prev, phase: 'stalled' } : prev
          );
        }
        return;
      }
      if (current.phase !== 'streaming' && current.phase !== 'stalled') return;
      const lastEventAt =
        current.lastChunkAt ?? current.firstChunkAt ?? current.startedAt ?? now;
      const idleForMs = now - lastEventAt;
      if (idleForMs >= STREAM_STALL_HARD_TIMEOUT_MS) {
        void cancelRunOnServer(
          current.conversationId ?? activeConversationId ?? chatSessionId ?? null
        );
        stop();
        setLocalChatError({
          message: t('chat.streamStalledTimedOut'),
          retryable: true,
          details:
            locale === 'zh'
              ? '流式输出长时间无增量，已自动停止。'
              : 'No new stream chunks were received for too long, request stopped.',
        });
        setStreamLifecycle((prev) => ({ ...prev, phase: 'failed' }));
        return;
      }
      if (idleForMs >= STREAM_STALL_SOFT_TIMEOUT_MS) {
        setStreamLifecycle((prev) =>
          prev.phase === 'streaming' ? { ...prev, phase: 'stalled' } : prev
        );
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [
    isStreaming,
    locale,
    activeConversationId,
    chatSessionId,
    cancelRunOnServer,
    stop,
    t,
  ]);

  return {
    streamLifecycle,
    localChatError,
    isStreaming,
    startStreamRun,
    markStreamCancelled,
    handleStop,
    canStartRun,
  };
}
