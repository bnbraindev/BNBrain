import { useEffect, useRef, useState, type RefObject } from 'react';

import type { UIMessage } from 'ai';
import { Loader2 } from 'lucide-react';
import { VList, type VListHandle } from 'virtua';

import { Message } from '../message';
import { InterruptedHint } from './interrupted-hint';
import { StreamingIndicator } from './streaming-indicator';

/** Keep the indicator visible for a grace period after isStreaming goes false,
 *  so it doesn't flicker during multi-tool responses (streaming→ready→submitted→streaming). */
const HIDE_DELAY_MS = 600;

interface MessageStreamViewProps {
  locale: 'en' | 'zh';
  t: (key: string) => string;
  viewportConversationKey: string;
  renderedMessages: UIMessage[];
  activeConversationId: string | null;
  isLoadingOlderMessages: boolean;
  isStreaming: boolean;
  readOnly?: boolean;
  onMessageListScroll: (offset: number) => void;
  messageListRef: RefObject<VListHandle | null>;
  showStreamSlowHint: boolean;
  showPendingAssistantCard: boolean;
  pendingAssistantText: string;
  showInterruptedHint: boolean;
  interruptedHintText: string;
  onContinueGeneration: () => void;
  onDismissInterrupted: () => void;
  hasPanel?: boolean;
}

export function MessageStreamView({
  locale,
  t,
  viewportConversationKey,
  renderedMessages,
  activeConversationId,
  isLoadingOlderMessages,
  isStreaming,
  readOnly,
  onMessageListScroll,
  messageListRef,
  showStreamSlowHint,
  showPendingAssistantCard,
  pendingAssistantText,
  showInterruptedHint,
  interruptedHintText,
  onContinueGeneration,
  onDismissInterrupted,
  hasPanel,
}: MessageStreamViewProps) {
  const safeRenderedMessages = renderedMessages.filter(
    (message): message is UIMessage =>
      Boolean(message?.id && typeof message.id === 'string')
  );
  const shouldShift = isLoadingOlderMessages && safeRenderedMessages.length > 0;

  const lastIsAssistant =
    safeRenderedMessages.length > 0 &&
    safeRenderedMessages[safeRenderedMessages.length - 1].role === 'assistant';

  // Debounced visibility: stays true for HIDE_DELAY_MS after isStreaming goes false
  const [showIndicator, setShowIndicator] = useState(isStreaming);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isStreaming) {
      // Immediately show when streaming starts
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      showTimerRef.current = setTimeout(() => {
        setShowIndicator(true);
        showTimerRef.current = null;
      }, 0);
    } else {
      // Delay hiding to absorb tool-call flickers
      hideTimerRef.current = setTimeout(() => {
        setShowIndicator(false);
        hideTimerRef.current = null;
      }, HIDE_DELAY_MS);
    }
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isStreaming]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy={isLoadingOlderMessages}>
      <VList
        key={viewportConversationKey}
        ref={messageListRef}
        itemSize={hasPanel ? 100 : 220}
        bufferSize={1200}
        shift={shouldShift}
        onScroll={onMessageListScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {safeRenderedMessages.map((message) => (
          <div key={message.id} className="mx-auto w-full max-w-3xl px-2 pb-5 sm:px-3 sm:pb-7">
            <Message
              message={message}
              conversationId={readOnly ? undefined : activeConversationId ?? undefined}
              readOnly={readOnly}
            />
          </div>
        ))}

        {/* Pending assistant placeholder while waiting for first output chunk */}
        {showPendingAssistantCard && (
          <div key="__pending-assistant" className="mx-auto w-full max-w-3xl px-2 pb-5 sm:px-3 sm:pb-7">
            <div className="pl-[26px]">
              <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
                <p className="text-xs text-muted-foreground">{pendingAssistantText}</p>
              </div>
            </div>
          </div>
        )}

        {/* Interrupted: resume / dismiss controls */}
        {showInterruptedHint && (
          <div key="__interrupted" className="mx-auto w-full max-w-3xl px-2 pb-5 sm:px-3 sm:pb-7">
            <InterruptedHint
              text={interruptedHintText}
              t={t}
              onContinue={onContinueGeneration}
              onDismiss={onDismissInterrupted}
            />
          </div>
        )}
      </VList>

      {/* Streaming indicator — rendered OUTSIDE VList to avoid layout shift.
          Uses fixed height + opacity transition instead of conditional mount/unmount. */}
      <div
        className={`mx-auto w-full max-w-3xl px-2 sm:px-3 transition-opacity duration-200 ${
          showIndicator ? 'h-auto opacity-100' : 'h-0 overflow-hidden opacity-0 pointer-events-none'
        }`}
        aria-hidden={!showIndicator}
      >
        <div className={showIndicator ? 'pb-3' : 'pb-0'}>
          <StreamingIndicator withHeader={!lastIsAssistant} locale={locale} />
        </div>
        {showIndicator && showStreamSlowHint && (
          <p className="pl-[26px] pt-1 text-[11px] text-amber-500/90">
            {t('chat.streamingSlow')}
          </p>
        )}
      </div>
    </div>
  );
}
