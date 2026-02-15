import { useCallback, useEffect, useMemo, useState } from 'react';

import { clearPendingRun, type PersistedPendingRun } from '@/lib/chat/pending-run-store';

import type { StreamLifecycleState } from '../types';

interface ChatErrorLike {
  message: string;
  retryable: boolean;
  details?: string;
}

interface UseInterruptedHintParams {
  activeConversationId: string | null;
  restoredPendingRun: PersistedPendingRun | null;
  isStreaming: boolean;
  hasInterruptedTurn: boolean;
  visibleMessageCount: number;
  chatError: ChatErrorLike | null;
  streamLifecycle: StreamLifecycleState;
  t: (key: string) => string;
}

export function useInterruptedHint({
  activeConversationId,
  restoredPendingRun,
  isStreaming,
  hasInterruptedTurn,
  visibleMessageCount,
  chatError,
  streamLifecycle,
  t,
}: UseInterruptedHintParams) {
  const [dismissedInterruptedHint, setDismissedInterruptedHint] = useState(false);

  useEffect(() => {
    if (!activeConversationId || !restoredPendingRun) return;
    if (isStreaming) return;
    if (hasInterruptedTurn) return;
    clearPendingRun(activeConversationId);
  }, [activeConversationId, restoredPendingRun, isStreaming, hasInterruptedTurn]);

  const interruptedHintText = useMemo(() => {
    let baseText = t('chat.resumeInterrupted');
    if (restoredPendingRun) {
      baseText =
        restoredPendingRun.phase === 'connecting'
          ? t('chat.resumeInterruptedConnecting')
          : t('chat.resumeInterruptedStreaming');
      baseText = `${baseText} (${t('chat.lastActivity')})`;
    }
    return baseText;
  }, [restoredPendingRun, t]);

  const showInterruptedHint =
    !isStreaming &&
    !chatError &&
    hasInterruptedTurn &&
    visibleMessageCount > 0 &&
    !dismissedInterruptedHint;

  const showPendingAssistantCard =
    isStreaming &&
    (streamLifecycle.phase === 'connecting' ||
      (streamLifecycle.phase === 'stalled' && streamLifecycle.firstChunkAt === null));

  const showStreamSlowHint =
    isStreaming &&
    streamLifecycle.phase === 'stalled' &&
    streamLifecycle.firstChunkAt !== null;

  const pendingAssistantText = useMemo(() => {
    if (streamLifecycle.phase === 'stalled') {
      return t('chat.connectingSlow');
    }
    return t('chat.connecting');
  }, [streamLifecycle.phase, t]);

  const dismissInterruptedHint = useCallback(() => {
    setDismissedInterruptedHint(true);
  }, []);

  const resetInterruptedHint = useCallback(() => {
    setDismissedInterruptedHint(false);
  }, []);

  return {
    dismissedInterruptedHint,
    interruptedHintText,
    showInterruptedHint,
    showPendingAssistantCard,
    showStreamSlowHint,
    pendingAssistantText,
    dismissInterruptedHint,
    resetInterruptedHint,
  };
}
